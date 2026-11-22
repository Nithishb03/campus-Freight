import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Package,
  Sparkles,
  Send,
  KeyRound,
  AlertTriangle,
  Clock,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Info
} from 'lucide-react';

const ITEM_CATEGORIES = [
  { value: 'LAB_EQUIPMENT', label: '🔬 Lab Equipment' },
  { value: 'DOCUMENTS', label: '📄 Academic Documents' },
  { value: 'HOSTEL_PARCEL', label: '📦 Hostel Parcel' },
  { value: 'MAINTENANCE', label: '🔧 Facility & Maintenance' },
  { value: 'BULK_SUPPLY', label: '🚚 Bulk Department Supply' }
];

const statusStyles = {
  PENDING_APPROVAL: { label: 'Pending Approval', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDING: { label: 'Pending Assignment', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  ASSIGNED: { label: 'Driver Assigned', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  PICKED_UP: { label: 'Picked Up', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  IN_TRANSIT: { label: 'In Transit', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  DELIVERED: { label: 'Delivered', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DELIVERY_ATTEMPTED: { label: 'Delivery Attempted', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  RETURNED_TO_MAILROOM: { label: 'Returned to Mailroom', badge: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-slate-100 text-slate-700 border-slate-200' }
};

const RequesterDashboard = () => {
  const { user } = useAuth();
  const [nodes, setNodes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    pickupHubId: user?.defaultCampusNode || 'CSE-BLOCK',
    pickupRoom: 'Lab 2',
    dropoffHubId: 'MAIN-MAILROOM',
    dropoffRoom: 'Office 1',
    recipientName: '',
    recipientPhone: '',
    itemCategory: 'LAB_EQUIPMENT',
    description: '',
    weightKg: 5,
    priority: 'STANDARD',
    isFragile: false,
    specialInstructions: '',
    externalTrackingId: ''
  });

  // Smart Estimate state
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');

  // Submit status
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const [formError, setFormError] = useState('');

  // Load campus nodes & user's orders
  const loadData = async () => {
    try {
      const [nodesRes, ordersRes] = await Promise.all([
        api.get('/delivery/nodes'),
        api.get('/orders')
      ]);
      setNodes(nodesRes.data?.data || []);
      setOrders(ordersRes.data?.data || []);
    } catch (err) {
      console.error('Error loading requester data:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Reset estimate on form change
    setEstimate(null);
  };

  // Smart Estimate Button
  const handleGetEstimate = async () => {
    setEstimating(true);
    setEstimateError('');
    try {
      const res = await api.post('/ai/recommend-dispatch', {
        pickupHubId: formData.pickupHubId,
        dropoffHubId: formData.dropoffHubId,
        weightKg: Number(formData.weightKg) || 0,
        isFragile: formData.isFragile,
        priority: formData.priority
      });
      setEstimate(res.data?.data);
    } catch (err) {
      setEstimateError(err.response?.data?.message || 'Failed to generate dispatch estimate.');
    } finally {
      setEstimating(false);
    }
  };

  // Submit Order Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setFormSuccess('');

    try {
      const pickupHub = nodes.find((n) => n.hubId === formData.pickupHubId);
      const dropoffHub = nodes.find((n) => n.hubId === formData.dropoffHubId);

      const payload = {
        pickupNode: {
          hubId: formData.pickupHubId,
          buildingName: pickupHub?.name || formData.pickupHubId,
          roomNumber: formData.pickupRoom,
          contactPhone: user?.phone || ''
        },
        dropoffNode: {
          hubId: formData.dropoffHubId,
          buildingName: dropoffHub?.name || formData.dropoffHubId,
          roomNumber: formData.dropoffRoom,
          recipientName: formData.recipientName || 'Campus Recipient',
          recipientPhone: formData.recipientPhone || user?.phone || ''
        },
        cargoDetails: {
          itemCategory: formData.itemCategory,
          description: formData.description,
          weightKg: Number(formData.weightKg) || 1,
          isFragile: formData.isFragile,
          specialInstructions: formData.specialInstructions
        },
        priority: formData.priority,
        externalTrackingId: formData.externalTrackingId || undefined
      };

      const res = await api.post('/orders', payload);
      const created = res.data?.data;

      setFormSuccess(`Order created successfully! Tracking ID: ${created.trackingId} (Status: ${created.status})`);
      setEstimate(null);
      loadData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to submit freight request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Requester Portal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Book internal campus freight, calculate automated dispatch feasibility, and track PoD verification.
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Book Freight Form Column */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span>Book Campus Freight</span>
          </h2>

          {formSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{formSuccess}</span>
            </div>
          )}

          {formError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Pickup & Dropoff Nodes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pickup Building</label>
                <select
                  name="pickupHubId"
                  value={formData.pickupHubId}
                  onChange={handleInputChange}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  {nodes.map((n) => (
                    <option key={n.hubId} value={n.hubId}>
                      {n.name} ({n.hubId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dropoff Building</label>
                <select
                  name="dropoffHubId"
                  value={formData.dropoffHubId}
                  onChange={handleInputChange}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  {nodes.map((n) => (
                    <option key={n.hubId} value={n.hubId}>
                      {n.name} ({n.hubId})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Room Numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pickup Room</label>
                <input
                  type="text"
                  name="pickupRoom"
                  value={formData.pickupRoom}
                  onChange={handleInputChange}
                  placeholder="e.g. Lab 2"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dropoff Room</label>
                <input
                  type="text"
                  name="dropoffRoom"
                  value={formData.dropoffRoom}
                  onChange={handleInputChange}
                  placeholder="e.g. Office 104"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Recipient Details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Recipient Name</label>
                <input
                  type="text"
                  name="recipientName"
                  value={formData.recipientName}
                  onChange={handleInputChange}
                  placeholder="Prof / Staff / Student"
                  required
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Recipient Phone</label>
                <input
                  type="text"
                  name="recipientPhone"
                  value={formData.recipientPhone}
                  onChange={handleInputChange}
                  placeholder="+91-..."
                  required
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Category & Weight */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Item Category</label>
                <select
                  name="itemCategory"
                  value={formData.itemCategory}
                  onChange={handleInputChange}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                >
                  {ITEM_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  name="weightKg"
                  min="0.1"
                  step="0.5"
                  value={formData.weightKg}
                  onChange={handleInputChange}
                  required
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Priority & Fragile Flag */}
            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                >
                  <option value="STANDARD">Standard</option>
                  <option value="URGENT">Urgent (Express)</option>
                  <option value="BULK">Bulk Department</option>
                </select>
              </div>

              <div className="pt-4">
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isFragile"
                    checked={formData.isFragile}
                    onChange={handleInputChange}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>⚠️ Fragile Item</span>
                </label>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Requires Admin approval & enclosed cart
                </span>
              </div>
            </div>

            {/* External Tracking ID (Optional) */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                External Tracking ID (Incoming Gate Parcel)
              </label>
              <input
                type="text"
                name="externalTrackingId"
                value={formData.externalTrackingId}
                onChange={handleInputChange}
                placeholder="e.g. BLUEDART-98721 (optional)"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            {/* Smart Estimate Section */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGetEstimate}
                disabled={estimating}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                {estimating ? 'Calculating Dispatch Route...' : 'Get AI Dispatch Recommendation'}
              </button>

              {estimateError && (
                <p className="mt-2 text-xs text-red-600">{estimateError}</p>
              )}

              {estimate && (
                <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="flex items-center gap-1">
                      Recommended: {estimate.recommendedVehicle?.name || 'No vehicle'}
                    </span>
                    <span className="text-blue-600 font-mono">
                      {estimate.recommendedVehicle?.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                    <div>Transit Distance: <strong className="text-slate-800">{estimate.distanceMeters}m</strong></div>
                    <div>Est. Duration: <strong className="text-slate-800">~{estimate.estimatedMinutes} mins</strong></div>
                  </div>

                  {estimate.requiresAdminApproval && (
                    <div className="p-2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Note: Requires Admin Approval prior to driver assignment (Fragile or &gt;50kg).</span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 italic">
                    "{estimate.reasoning}"
                  </p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Submitting Freight Request...' : 'Submit Freight Request'}
            </button>
          </form>
        </div>

        {/* My Shipments Table Column */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>My Campus Shipments</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {orders.length}
              </span>
            </h2>
            <span className="text-xs text-slate-500">Includes secure PoD OTPs</span>
          </div>

          {loadingOrders ? (
            <div className="py-16 text-center text-slate-400 text-xs">Loading shipments...</div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">No active shipments yet</p>
              <p className="text-xs text-slate-400 mt-1">Book your first campus freight transfer on the left</p>
            </div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Tracking ID</th>
                    <th className="py-2.5 px-3">Route (From → To)</th>
                    <th className="py-2.5 px-3">Cargo</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-center">PoD OTP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => {
                    const statusMeta = statusStyles[order.status] || statusStyles.PENDING;
                    return (
                      <tr key={order._id} className="hover:bg-slate-50/80 transition">
                        {/* Tracking ID */}
                        <td className="py-3 px-3">
                          <span className="font-mono font-bold text-blue-700 block">
                            {order.trackingId}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </span>
                        </td>

                        {/* Route */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">
                            {order.pickupNode?.hubId} → {order.dropoffNode?.hubId}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Rm {order.pickupNode?.roomNumber || 'N/A'} → Rm {order.dropoffNode?.roomNumber || 'N/A'}
                          </div>
                        </td>

                        {/* Cargo info */}
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800">
                            {order.cargoDetails?.itemCategory?.replace('_', ' ')}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <span>{order.cargoDetails?.weightKg} kg</span>
                            {order.cargoDetails?.isFragile && (
                              <span className="text-amber-600 font-bold">· Fragile</span>
                            )}
                          </div>
                        </td>

                        {/* Status badge */}
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta.badge}`}>
                            {statusMeta.label}
                          </span>
                        </td>

                        {/* Handover OTP Badge */}
                        <td className="py-3 px-3 text-center">
                          {order.status === 'DELIVERED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-mono text-xs font-bold border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Verified
                            </span>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-mono font-extrabold text-sm tracking-widest shadow-2xs">
                                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                                {order.pod?.otp || '----'}
                              </span>
                              <span className="text-[9px] text-slate-400 mt-0.5">Share with driver</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequesterDashboard;
