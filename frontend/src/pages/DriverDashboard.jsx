import React, { useState, useEffect } from 'react';
import api from '../api/client';
import socket from '../api/socket';
import CampusMap3D from '../components/CampusMap3D';
import {
  Truck,
  Sparkles,
  Navigation,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  KeyRound,
  X,
  RefreshCw,
  Flame,
  ArrowRight,
  Bell
} from 'lucide-react';

const DriverDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Route optimization state
  const [optimizing, setOptimizing] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [routeError, setRouteError] = useState('');

  // Complete Delivery Modal (Requires OTP)
  const [completeModalOrder, setCompleteModalOrder] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  // Failed Delivery Modal (Requires Reason)
  const [failedModalOrder, setFailedModalOrder] = useState(null);
  const [failedStatus, setFailedStatus] = useState('DELIVERY_ATTEMPTED');
  const [failedReason, setFailedReason] = useState('');
  const [failing, setFailing] = useState(false);
  const [failedError, setFailedError] = useState('');

  const loadDriverOrders = async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching driver deliveries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDriverOrders();
  }, []);

  // Socket.io Real-Time Synchronization
  useEffect(() => {
    const handleOrderUpdated = (data) => {
      loadDriverOrders();
      const trk = data?.order?.trackingId || 'Order';
      const st = data?.order?.status?.replace('_', ' ') || 'updated';
      setToastMessage({ text: `⚡ Delivery Update: ${trk} status changed to ${st}`, type: 'info' });
    };

    const handleFleetUpdated = () => {
      loadDriverOrders();
    };

    socket.on('order:updated', handleOrderUpdated);
    socket.on('fleet:updated', handleFleetUpdated);

    return () => {
      socket.off('order:updated', handleOrderUpdated);
      socket.off('fleet:updated', handleFleetUpdated);
    };
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Optimize Route Button
  const handleOptimizeRoute = async () => {
    setOptimizing(true);
    setRouteError('');
    try {
      const assignedActive = orders.filter((o) =>
        ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(o.status)
      );

      const res = await api.post('/ai/optimize-route', {
        startHubId: 'MAIN-MAILROOM',
        orderIds: assignedActive.map((o) => o._id)
      });

      setRouteResult(res.data?.data);
    } catch (err) {
      setRouteError(err.response?.data?.message || 'Failed to optimize campus route.');
    } finally {
      setOptimizing(false);
    }
  };

  // Quick Status update (e.g., PICKED_UP or IN_TRANSIT)
  const handleQuickStatus = async (orderId, newStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: newStatus });
      await loadDriverOrders();
    } catch (err) {
      alert(err.response?.data?.message || `Failed to update status to ${newStatus}`);
    }
  };

  // Submit Complete Delivery with OTP
  const handleCompleteSubmit = async (e) => {
    e.preventDefault();
    if (!completeModalOrder) return;

    setCompleting(true);
    setCompleteError('');

    try {
      await api.put(`/orders/${completeModalOrder._id}/status`, {
        status: 'DELIVERED',
        otp: otpInput.trim(),
        deliveryNotes: deliveryNotes.trim()
      });

      setCompleteModalOrder(null);
      setOtpInput('');
      setDeliveryNotes('');
      await loadDriverOrders();
    } catch (err) {
      setCompleteError(err.response?.data?.message || 'Failed to complete delivery. Check OTP.');
    } finally {
      setCompleting(false);
    }
  };

  // Submit Failed Attempt
  const handleFailedSubmit = async (e) => {
    e.preventDefault();
    if (!failedModalOrder) return;

    setFailing(true);
    setFailedError('');

    try {
      await api.put(`/orders/${failedModalOrder._id}/status`, {
        status: failedStatus,
        failedReason: failedReason.trim()
      });

      setFailedModalOrder(null);
      setFailedReason('');
      await loadDriverOrders();
    } catch (err) {
      setFailedError(err.response?.data?.message || 'Failed to submit attempt report.');
    } finally {
      setFailing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600 animate-bounce" />
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-amber-600" />
            Driver Console & Route Navigator
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Execute active runs, optimize dropoff sequences, and capture verified Proof-of-Delivery OTPs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOptimizeRoute}
            disabled={optimizing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            {optimizing ? 'Calculating Route...' : 'Optimize My Route'}
          </button>

          <button
            onClick={loadDriverOrders}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {routeError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{routeError}</span>
        </div>
      )}

      {/* Route Optimization Summary Card (if generated) */}
      {routeResult && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-600 text-white">
                <Navigation className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Optimized Route ({routeResult.vehicleType})
                </h3>
                <span className="text-xs text-blue-700 font-medium">
                  {routeResult.source === 'gemini' ? '✨ Gemini AI Enriched Sequence' : 'Deterministic Nearest-Neighbor Sequence'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
              <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-blue-100">
                Transit Distance: <strong className="text-blue-700">{routeResult.totalDistanceMeters}m</strong>
              </div>
              <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-blue-100">
                Est. Duration: <strong className="text-blue-700">~{routeResult.estimatedMinutes} mins</strong>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 italic">
            "{routeResult.reasoning}"
          </p>

          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 text-xs">
            <span className="px-2 py-1 rounded bg-white text-slate-800 font-bold border border-slate-200 shrink-0">
              Start: Main Mailroom
            </span>
            {routeResult.orderedStops.map((stop, i) => (
              <React.Fragment key={stop.trackingId || i}>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className={`px-2 py-1 rounded font-bold border shrink-0 ${
                  stop.priority === 'URGENT'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-white text-slate-800 border-slate-200'
                }`}>
                  Stop {i + 1}: {stop.buildingName} ({stop.trackingId})
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Interactive Route Map & Assigned Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Assigned Deliveries Cards */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Assigned Campus Deliveries</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                {orders.length}
              </span>
            </h2>
            <span className="text-xs text-slate-400">Update status as you proceed</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading deliveries...</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white p-6">
              <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">No deliveries assigned currently</p>
              <p className="text-xs text-slate-400 mt-1">Check back when the mailroom dispatches orders</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const isDelivered = order.status === 'DELIVERED';
                return (
                  <div
                    key={order._id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3"
                  >
                    {/* Top Row: Tracking & Badges */}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono font-bold text-slate-900 text-sm block">
                          {order.trackingId}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {order.cargoDetails?.itemCategory?.replace('_', ' ')} · {order.cargoDetails?.weightKg} kg
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 justify-end">
                        {order.cargoDetails?.isFragile && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200 animate-pulse">
                            ⚠️ FRAGILE
                          </span>
                        )}
                        {order.priority === 'URGENT' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                            ⚡ URGENT
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Route Details */}
                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Pickup</span>
                        <strong className="text-slate-800 block">{order.pickupNode?.buildingName}</strong>
                        <span className="text-slate-500 text-[11px]">Room {order.pickupNode?.roomNumber || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Dropoff</span>
                        <strong className="text-slate-800 block">{order.dropoffNode?.buildingName}</strong>
                        <span className="text-slate-500 text-[11px]">
                          Room {order.dropoffNode?.roomNumber || 'N/A'} ({order.dropoffNode?.recipientName})
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {!isDelivered ? (
                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        {order.status === 'ASSIGNED' && (
                          <button
                            onClick={() => handleQuickStatus(order._id, 'PICKED_UP')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer"
                          >
                            Mark Picked Up
                          </button>
                        )}

                        {order.status === 'PICKED_UP' && (
                          <button
                            onClick={() => handleQuickStatus(order._id, 'IN_TRANSIT')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer"
                          >
                            Start Transit
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setCompleteModalOrder(order);
                            setOtpInput('');
                            setDeliveryNotes('');
                            setCompleteError('');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer inline-flex items-center gap-1"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Complete (Enter OTP)
                        </button>

                        <button
                          onClick={() => {
                            setFailedModalOrder(order);
                            setFailedReason('');
                            setFailedError('');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 transition cursor-pointer ml-auto"
                        >
                          Report Issue
                        </button>
                      </div>
                    ) : (
                      <div className="pt-2 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Delivered & Handover Confirmed with PoD OTP</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Map & Route View */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span>3D Campus Navigation & Route View</span>
            </h2>
            <span className="text-xs text-slate-500">
              {routeResult ? 'Displaying 3D Waypoints & Animated Delivery Fleet' : 'Click "Optimize My Route" to render 3D route trajectory'}
            </span>
          </div>

          <CampusMap3D
            routeStops={routeResult?.orderedStops || null}
            height="550px"
          />
        </div>
      </div>

      {/* Complete Delivery Modal (Requires 4-Digit OTP) */}
      {completeModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Complete Campus Handover</h3>
                <span className="text-xs text-slate-500 font-mono">
                  {completeModalOrder.trackingId}
                </span>
              </div>
              <button
                onClick={() => setCompleteModalOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {completeError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{completeError}</span>
              </div>
            )}

            <form onSubmit={handleCompleteSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Recipient Proof-of-Delivery OTP (4 Digits) *
                </label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  autoFocus
                  placeholder="e.g. 4821"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  className="w-full text-center text-2xl font-mono font-bold tracking-widest p-3 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:bg-white focus:outline-hidden"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Ask the recipient at {completeModalOrder.dropoffNode?.buildingName} to show their 4-digit code.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Delivery Notes (Optional)
                </label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="e.g. Handed over at Department reception"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCompleteModalOrder(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={completing || otpInput.length < 4}
                  className="px-4 py-2 rounded-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {completing ? 'Verifying OTP...' : 'Verify & Complete Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Failed Delivery Modal */}
      {failedModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Report Delivery Exception</h3>
                <span className="text-xs text-slate-500 font-mono">
                  {failedModalOrder.trackingId}
                </span>
              </div>
              <button
                onClick={() => setFailedModalOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {failedError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{failedError}</span>
              </div>
            )}

            <form onSubmit={handleFailedSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status Type</label>
                <select
                  value={failedStatus}
                  onChange={(e) => setFailedStatus(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                >
                  <option value="DELIVERY_ATTEMPTED">Delivery Attempted (Recipient Unavailable)</option>
                  <option value="RETURNED_TO_MAILROOM">Returned to Main Gate Mailroom</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Reason for Failure *</label>
                <textarea
                  required
                  rows={3}
                  value={failedReason}
                  onChange={(e) => setFailedReason(e.target.value)}
                  placeholder="e.g. Lab was locked, recipient not reachable via phone"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
                ></textarea>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFailedModalOrder(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={failing}
                  className="px-4 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {failing ? 'Submitting...' : 'Record Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;
