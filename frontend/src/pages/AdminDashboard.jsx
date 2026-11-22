import React, { useState, useEffect } from 'react';
import api from '../api/client';
import CampusMap3D from '../components/CampusMap3D';
import {
  ShieldAlert,
  Truck,
  CheckCircle2,
  Clock,
  Layers,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  X,
  ChevronRight,
  MapPin,
  Flame
} from 'lucide-react';

const AdminDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Active view tab
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'fleet' | 'map'

  // Modal State for Driver / Vehicle Assignment
  const [assignModalOrder, setAssignModalOrder] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');

  // Approving state
  const [approvingId, setApprovingId] = useState(null);

  const loadDashboardData = async () => {
    try {
      const [sumRes, ordersRes, vehiclesRes, driversRes] = await Promise.all([
        api.get('/orders/analytics/summary'),
        api.get('/orders'),
        api.get('/delivery/vehicles'),
        api.get('/delivery/drivers')
      ]);

      setSummary(sumRes.data?.data);
      setOrders(ordersRes.data?.data || []);
      setVehicles(vehiclesRes.data?.data || []);
      setDrivers(driversRes.data?.data || []);
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Handle Approve order
  const handleApprove = async (orderId) => {
    setApprovingId(orderId);
    try {
      await api.put(`/orders/${orderId}/approve`);
      await loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve order.');
    } finally {
      setApprovingId(null);
    }
  };

  // Open Assign Modal
  const openAssignModal = (order) => {
    setAssignModalOrder(order);
    setSelectedDriverId(drivers[0]?.agentId || drivers[0]?._id || '');
    setSelectedVehicleId(vehicles[0]?.vehicleId || vehicles[0]?._id || '');
    setAssignError('');
    setAssignSuccess('');
  };

  // Handle Assign submission
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignModalOrder) return;

    setAssigning(true);
    setAssignError('');
    setAssignSuccess('');

    try {
      await api.put(`/orders/${assignModalOrder._id}/assign`, {
        driverId: selectedDriverId,
        vehicleId: selectedVehicleId
      });

      setAssignSuccess(`Order ${assignModalOrder.trackingId} successfully assigned!`);
      setTimeout(() => {
        setAssignModalOrder(null);
        loadDashboardData();
      }, 1200);
    } catch (err) {
      setAssignError(err.response?.data?.message || 'Assignment failed. Please check constraints.');
    } finally {
      setAssigning(false);
    }
  };

  // Filtered orders
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = selectedStatus === 'ALL' || order.status === selectedStatus;
    const matchesSearch =
      order.trackingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.pickupNode?.hubId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.dropoffNode?.hubId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.requesterId?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-purple-600" />
            Freight Administration & Mailroom Dispatch
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor real-time campus logistics, enforce building pedestrian accessibility, and manage fleet loads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboardData}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Data
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading dashboard metrics...</div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Pending Approval */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Approval</span>
              <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <ShieldAlert className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-extrabold text-amber-600 mt-2">
              {summary.statusCounts?.PENDING_APPROVAL || 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Fragile or &gt;50kg requiring sign-off</div>
          </div>

          {/* Active Shipments */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Shipments</span>
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Truck className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-extrabold text-blue-600 mt-2">
              {(summary.statusCounts?.ASSIGNED || 0) +
                (summary.statusCounts?.PICKED_UP || 0) +
                (summary.statusCounts?.IN_TRANSIT || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Active Weight: {summary.totalActiveCargoWeightKg || 0} kg
            </div>
          </div>

          {/* Delivered */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivered</span>
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 mt-2">
              {summary.statusCounts?.DELIVERED || 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">With verified PoD OTPs</div>
          </div>

          {/* Fleet Load & Utilization */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fleet Utilization</span>
              <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                <Flame className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-extrabold text-slate-800 mt-2">
              {summary.fleet?.fleetUtilizationPct || 0}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {summary.fleet?.currentLoadKg || 0} / {summary.fleet?.totalCapacityKg || 0} kg total capacity
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 border-b-2 cursor-pointer transition ${
            activeTab === 'orders'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Orders Management ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('fleet')}
          className={`pb-3 border-b-2 cursor-pointer transition ${
            activeTab === 'fleet'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Campus Fleet Status ({vehicles.length})
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`pb-3 border-b-2 cursor-pointer transition ${
            activeTab === 'map'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Live Campus Network Map
        </button>
      </div>

      {/* Tab 1: Orders Management */}
      {activeTab === 'orders' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Status Pills */}
            <div className="flex flex-wrap gap-1.5 text-xs">
              {['ALL', 'PENDING_APPROVAL', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    selectedStatus === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search tracking, hub, user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Tracking ID</th>
                  <th className="py-2.5 px-3">Requester</th>
                  <th className="py-2.5 px-3">Route (From → To)</th>
                  <th className="py-2.5 px-3">Cargo Details</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Assignment</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No orders match the current filter
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order._id} className="hover:bg-slate-50/80 transition">
                      {/* Tracking ID */}
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-slate-900 block">{order.trackingId}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Requester */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{order.requesterId?.name || 'Requester'}</div>
                        <div className="text-[10px] text-slate-400">{order.requesterId?.department}</div>
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

                      {/* Cargo Details */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800">
                          {order.cargoDetails?.itemCategory?.replace('_', ' ')}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          <span>{order.cargoDetails?.weightKg} kg</span>
                          {order.cargoDetails?.isFragile && (
                            <span className="text-amber-600 font-bold">· ⚠️ Fragile</span>
                          )}
                          {order.priority === 'URGENT' && (
                            <span className="text-red-600 font-bold">· ⚡ Urgent</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            order.status === 'PENDING_APPROVAL'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : order.status === 'DELIVERED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Driver & Vehicle */}
                      <td className="py-3 px-3">
                        {order.assignment?.driverId ? (
                          <div>
                            <div className="font-semibold text-slate-700">
                              {order.assignment.driverId?.name || 'Assigned Driver'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {order.assignment.vehicleId?.name} ({order.assignment.vehicleId?.type})
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right space-x-1.5">
                        {order.status === 'PENDING_APPROVAL' && (
                          <button
                            onClick={() => handleApprove(order._id)}
                            disabled={approvingId === order._id}
                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
                          >
                            {approvingId === order._id ? 'Approving...' : 'Approve'}
                          </button>
                        )}

                        {order.status === 'PENDING' && (
                          <button
                            onClick={() => openAssignModal(order)}
                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer"
                          >
                            Assign Fleet
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Campus Fleet Status */}
      {activeTab === 'fleet' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map((v) => {
            const loadPct = Math.round(((v.currentLoadKg || 0) / (v.maxWeightKg || 1)) * 100);
            return (
              <div key={v.vehicleId} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{v.name}</h3>
                    <span className="text-xs text-slate-400 font-mono">{v.registrationNumber}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      v.status === 'AVAILABLE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : v.status === 'IN_TRANSIT'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {v.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Vehicle Class:</span>
                    <strong className="text-slate-800">{v.type}</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Live Load:</span>
                    <strong className="text-slate-800">
                      {v.currentLoadKg || 0} kg / {v.maxWeightKg} kg ({loadPct}%)
                    </strong>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${
                        loadPct > 80 ? 'bg-red-500' : loadPct > 50 ? 'bg-amber-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, loadPct)}%` }}
                    ></div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Current Node: {v.currentHubId || 'MAIN-MAILROOM'}</span>
                  <span>Orders: {v.assignedOrders?.length || 0}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Campus Map Tab */}
      {activeTab === 'map' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Live 3D Campus Freight & Network Map</h3>
              <p className="text-xs text-slate-500">Interactive architectural 3D campus model. Orbit, zoom, or inspect buildings and pedestrian access.</p>
            </div>
            <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200 font-semibold">
              Three.js + React Three Fiber
            </span>
          </div>
          <CampusMap3D height="600px" activeOrders={orders.filter(o => o.status === 'IN_TRANSIT')} />
        </div>
      )}

      {/* Assign Driver & Vehicle Modal */}
      {assignModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Assign Fleet to Order</h3>
                <span className="text-xs text-blue-600 font-mono font-bold">
                  {assignModalOrder.trackingId}
                </span>
              </div>
              <button
                onClick={() => setAssignModalOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Guardrail Error Display */}
            {assignError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{assignError}</span>
              </div>
            )}

            {assignSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{assignSuccess}</span>
              </div>
            )}

            {/* Order constraints summary */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div><strong>Pickup:</strong> {assignModalOrder.pickupNode?.buildingName} ({assignModalOrder.pickupNode?.hubId})</div>
              <div><strong>Dropoff:</strong> {assignModalOrder.dropoffNode?.buildingName} ({assignModalOrder.dropoffNode?.hubId})</div>
              <div><strong>Weight:</strong> {assignModalOrder.cargoDetails?.weightKg} kg {assignModalOrder.cargoDetails?.isFragile ? '· ⚠️ Fragile' : ''}</div>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4 text-xs">
              {/* Driver Select */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Delivery Driver</label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                  required
                >
                  {drivers.map((d) => (
                    <option key={d.agentId} value={d.agentId}>
                      {d.name} ({d.assignedZone} Zone - {d.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Vehicle Select */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Fleet Vehicle</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                  required
                >
                  {vehicles.map((v) => (
                    <option key={v.vehicleId} value={v.vehicleId}>
                      {v.name} ({v.type}) — Cap: {v.currentLoadKg || 0}/{v.maxWeightKg} kg ({v.status})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Backend will enforce atomic weight capacity and building pedestrian vehicle permissions.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOrder(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {assigning ? 'Verifying & Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
