import React, { useState, useEffect } from 'react';
import api from '../api/client';
import socket from '../api/socket';
import CampusMap3D from '../components/CampusMap3D';
import generateWaybillPdf from '../utils/waybillPdf';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
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
  Flame,
  History,
  XCircle,
  RotateCcw,
  Bell,
  BarChart3,
  Settings,
  Plus,
  Leaf,
  FileText,
  Wrench,
  Building2
} from 'lucide-react';

const AdminDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Filter state
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Active view tab: 'orders' | 'fleet' | 'analytics' | 'map'
  const [activeTab, setActiveTab] = useState('orders');

  // Modal State for Driver / Vehicle Assignment
  const [assignModalOrder, setAssignModalOrder] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');

  // Modal State for Driver / Vehicle Reassignment
  const [reassignModalOrder, setReassignModalOrder] = useState(null);
  const [reassignDriverId, setReassignDriverId] = useState('');
  const [reassignVehicleId, setReassignVehicleId] = useState('');
  const [reassignReason, setReassignReason] = useState('Operational route optimization');
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState('');
  const [reassignSuccess, setReassignSuccess] = useState('');

  // Timeline Modal State
  const [timelineOrder, setTimelineOrder] = useState(null);

  // Manage Fleet & Nodes Modal State
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageTab, setManageTab] = useState('vehicles'); // 'vehicles' | 'nodes'
  const [manageError, setManageError] = useState('');
  const [manageSuccess, setManageSuccess] = useState('');

  // New Vehicle Form State
  const [vehicleForm, setVehicleForm] = useState({
    name: '',
    type: 'ECART',
    registrationNumber: '',
    maxWeightKg: 150,
    currentHubId: 'MAIN-MAILROOM'
  });
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [togglingVehicleId, setTogglingVehicleId] = useState(null);

  // New Campus Node Form State
  const [nodeForm, setNodeForm] = useState({
    hubId: '',
    name: '',
    zone: 'ACADEMIC',
    isPedestrianOnly: false,
    x: 500,
    y: 500,
    width: 90,
    depth: 60,
    height: 35
  });
  const [creatingNode, setCreatingNode] = useState(false);
  const [togglingNodeId, setTogglingNodeId] = useState(null);

  // Approving & Cancelling states
  const [approvingId, setApprovingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const loadDashboardData = async () => {
    try {
      const [sumRes, ordersRes, vehiclesRes, driversRes, nodesRes] = await Promise.all([
        api.get('/orders/analytics/summary'),
        api.get('/orders'),
        api.get('/delivery/vehicles'),
        api.get('/delivery/drivers'),
        api.get('/nodes')
      ]);

      setSummary(sumRes.data?.data);
      setOrders(ordersRes.data?.data || []);
      setVehicles(vehiclesRes.data?.data || []);
      setDrivers(driversRes.data?.data || []);
      setNodes(nodesRes.data?.data || []);
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Socket.io Real-Time Synchronization
  useEffect(() => {
    const handleOrderUpdated = (data) => {
      loadDashboardData();
      const trk = data?.order?.trackingId || 'Order';
      const st = data?.order?.status?.replace('_', ' ') || 'updated';
      setToastMessage({ text: `⚡ Live Sync: ${trk} status changed to ${st}`, type: 'info' });
    };

    const handleFleetUpdated = () => {
      loadDashboardData();
    };

    socket.on('order:updated', handleOrderUpdated);
    socket.on('fleet:updated', handleFleetUpdated);

    return () => {
      socket.off('order:updated', handleOrderUpdated);
      socket.off('fleet:updated', handleFleetUpdated);
    };
  }, []);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Handle Approve order
  const handleApprove = async (orderId) => {
    setApprovingId(orderId);
    try {
      await api.put(`/orders/${orderId}/approve`);
      setToastMessage({ text: 'Order approved successfully!', type: 'success' });
      await loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve order.');
    } finally {
      setApprovingId(null);
    }
  };

  // Handle Cancel order
  const handleCancel = async (order) => {
    const confirmCancel = window.confirm(`Are you sure you want to cancel order ${order.trackingId}? This will immediately release any assigned vehicle payload.`);
    if (!confirmCancel) return;

    setCancellingId(order._id);
    try {
      await api.put(`/orders/${order._id}/cancel`, {
        reason: 'Cancelled by Mailroom Admin'
      });
      setToastMessage({ text: `Order ${order.trackingId} cancelled and fleet load released.`, type: 'info' });
      await loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order.');
    } finally {
      setCancellingId(null);
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

  // Open Reassign Modal
  const openReassignModal = (order) => {
    setReassignModalOrder(order);
    setReassignDriverId(drivers[0]?.agentId || drivers[0]?._id || '');
    setReassignVehicleId(vehicles[0]?.vehicleId || vehicles[0]?._id || '');
    setReassignReason('Operational route optimization');
    setReassignError('');
    setReassignSuccess('');
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
      }, 1000);
    } catch (err) {
      setAssignError(err.response?.data?.message || 'Assignment failed. Please check constraints.');
    } finally {
      setAssigning(false);
    }
  };

  // Handle Reassign submission
  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!reassignModalOrder) return;

    setReassigning(true);
    setReassignError('');
    setReassignSuccess('');

    try {
      await api.put(`/orders/${reassignModalOrder._id}/reassign`, {
        driverId: reassignDriverId,
        vehicleId: reassignVehicleId,
        reason: reassignReason.trim()
      });

      setReassignSuccess(`Order ${reassignModalOrder.trackingId} successfully reassigned!`);
      setTimeout(() => {
        setReassignModalOrder(null);
        loadDashboardData();
      }, 1000);
    } catch (err) {
      setReassignError(err.response?.data?.message || 'Reassignment failed. Please check capacity and zoning.');
    } finally {
      setReassigning(false);
    }
  };

  // Toggle Vehicle MAINTENANCE mode
  const handleToggleMaintenance = async (vehicle) => {
    setTogglingVehicleId(vehicle._id);
    setManageError('');
    setManageSuccess('');
    const newStatus = vehicle.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';
    try {
      await api.put(`/vehicles/${vehicle._id}`, { status: newStatus });
      setToastMessage({
        text: `Vehicle ${vehicle.name} status updated to ${newStatus}`,
        type: 'success'
      });
      await loadDashboardData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update vehicle status';
      setManageError(msg);
      alert(msg);
    } finally {
      setTogglingVehicleId(null);
    }
  };

  // Toggle Campus Node Pedestrian Only
  const handleTogglePedestrian = async (node) => {
    setTogglingNodeId(node._id);
    setManageError('');
    setManageSuccess('');
    const newPedStatus = !node.isPedestrianOnly;
    try {
      await api.put(`/nodes/${node._id}`, { isPedestrianOnly: newPedStatus });
      setToastMessage({
        text: `Building ${node.name} pedestrian restriction set to ${newPedStatus ? 'PEDESTRIAN ONLY' : 'OPEN'}`,
        type: 'info'
      });
      await loadDashboardData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update campus node';
      setManageError(msg);
      alert(msg);
    } finally {
      setTogglingNodeId(null);
    }
  };

  // Submit New Vehicle
  const handleCreateVehicle = async (e) => {
    e.preventDefault();
    setCreatingVehicle(true);
    setManageError('');
    setManageSuccess('');
    try {
      await api.post('/vehicles', {
        ...vehicleForm,
        maxWeightKg: Number(vehicleForm.maxWeightKg)
      });
      setManageSuccess(`Vehicle ${vehicleForm.name} registered successfully!`);
      setVehicleForm({
        name: '',
        type: 'ECART',
        registrationNumber: '',
        maxWeightKg: 150,
        currentHubId: 'MAIN-MAILROOM'
      });
      await loadDashboardData();
    } catch (err) {
      setManageError(err.response?.data?.message || 'Failed to register vehicle.');
    } finally {
      setCreatingVehicle(false);
    }
  };

  // Submit New Node
  const handleCreateNode = async (e) => {
    e.preventDefault();
    setCreatingNode(true);
    setManageError('');
    setManageSuccess('');
    try {
      await api.post('/nodes', {
        hubId: nodeForm.hubId.trim().toUpperCase(),
        name: nodeForm.name.trim(),
        zone: nodeForm.zone,
        isPedestrianOnly: nodeForm.isPedestrianOnly,
        mapPosition: {
          x: Number(nodeForm.x),
          y: Number(nodeForm.y),
          z: 0
        },
        dimensions: {
          width: Number(nodeForm.width),
          depth: Number(nodeForm.depth),
          height: Number(nodeForm.height)
        }
      });
      setManageSuccess(`Campus building ${nodeForm.name} added successfully!`);
      setNodeForm({
        hubId: '',
        name: '',
        zone: 'ACADEMIC',
        isPedestrianOnly: false,
        x: 500,
        y: 500,
        width: 90,
        depth: 60,
        height: 35
      });
      await loadDashboardData();
    } catch (err) {
      setManageError(err.response?.data?.message || 'Failed to create campus node.');
    } finally {
      setCreatingNode(false);
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
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in duration-200 ${
          toastMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}>
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
            <Layers className="w-6 h-6 text-purple-600" />
            Freight Administration & Mailroom Dispatch
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor real-time campus logistics, enforce building pedestrian accessibility, and manage fleet loads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setManageModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition shadow-xs cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Manage Fleet & Nodes
          </button>

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
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 border-b-2 cursor-pointer transition flex items-center gap-1.5 ${
            activeTab === 'analytics'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics & Green KPIs
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
                      <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                        {/* Printable PDF Waybill / Receipt */}
                        <button
                          onClick={() => generateWaybillPdf(order)}
                          title="Download Printable PDF Waybill / Receipt"
                          className="px-2 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer inline-flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>

                        {/* View Audit Timeline */}
                        <button
                          onClick={() => setTimelineOrder(order)}
                          title="View Audit Timeline"
                          className="px-2 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-blue-700 hover:bg-slate-100 transition cursor-pointer inline-flex items-center gap-1"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Timeline</span>
                        </button>

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

                        {['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERY_ATTEMPTED', 'RETURNED_TO_MAILROOM'].includes(order.status) && (
                          <button
                            onClick={() => openReassignModal(order)}
                            title="Reassign Driver / Vehicle"
                            className="px-2 py-1 rounded-md text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition cursor-pointer inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reassign</span>
                          </button>
                        )}

                        {!['DELIVERED', 'CANCELLED'].includes(order.status) && (
                          <button
                            onClick={() => handleCancel(order)}
                            disabled={cancellingId === order._id}
                            title="Cancel Order & Rollback Load"
                            className="px-2 py-1 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition cursor-pointer inline-flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{cancellingId === order._id ? 'Cancelling...' : 'Cancel'}</span>
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleMaintenance(v)}
                      disabled={togglingVehicleId === v._id}
                      title={v.status === 'MAINTENANCE' ? 'Mark vehicle available' : 'Take vehicle offline for maintenance'}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                        v.status === 'MAINTENANCE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      {togglingVehicleId === v._id ? 'Updating...' : v.status === 'MAINTENANCE' ? 'Set Available' : 'Set Maint.'}
                    </button>
                    <span>Orders: {v.assignedOrders?.length || 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Analytics Dashboard & Green Logistics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Green Logistics KPI Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 rounded-2xl border border-emerald-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Green Logistics Rate</span>
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                  <Leaf className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-emerald-700 mt-2">
                {summary?.greenLogistics?.greenTripPct ?? 100}%
              </div>
              <div className="text-[11px] text-emerald-600 mt-1">Zero-emission campus deliveries</div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-2xl border border-blue-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Est. CO₂ Avoided</span>
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                  <Flame className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-blue-700 mt-2">
                {summary?.greenLogistics?.co2SavedKg ?? 0} <span className="text-base font-bold">kg</span>
              </div>
              <div className="text-[11px] text-blue-600 mt-1">Compared to diesel van baseline</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clean Fleet Runs</span>
                <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
                  <Truck className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-purple-700 mt-2">
                {summary?.greenLogistics?.zeroEmissionTrips ?? 0}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Trips via ECart, Bike & Trolley</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Cargo in Transit</span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                  <Layers className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-amber-600 mt-2">
                {summary?.totalActiveCargoWeightKg ?? 0} <span className="text-base font-bold">kg</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Live payload rolling on campus</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Top 5 Busiest Campus Buildings */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Top 5 Busiest Campus Hubs</h3>
                  <p className="text-xs text-slate-400">Total freight traffic (Pickups + Dropoffs)</p>
                </div>
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <Building2 className="w-4 h-4" />
                </span>
              </div>

              <div className="h-64 w-full text-xs">
                {(!summary?.busiestHubs || summary.busiestHubs.length === 0) ? (
                  <div className="h-full flex items-center justify-center text-slate-400">No hub activity recorded yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.busiestHubs} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <XAxis dataKey="buildingName" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="totalTrips" fill="#3b82f6" name="Total Shipments" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Fleet Activity by Vehicle Class */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Fleet Activity by Vehicle Class</h3>
                  <p className="text-xs text-slate-400">Total shipments & weight moved (kg)</p>
                </div>
                <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                  <Truck className="w-4 h-4" />
                </span>
              </div>

              <div className="h-64 w-full text-xs">
                {(!summary?.fleetUtilizationByType || summary.fleetUtilizationByType.length === 0) ? (
                  <div className="h-full flex items-center justify-center text-slate-400">No fleet activity recorded yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.fleetUtilizationByType} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="totalDeliveries" fill="#8b5cf6" name="Deliveries" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="totalWeightKg" fill="#0ea5e9" name="Weight Moved (kg)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Campus Map Tab */}
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

      {/* Reassign Driver & Vehicle Modal */}
      {reassignModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-purple-600" />
                  <span>Reassign Fleet Driver & Vehicle</span>
                </h3>
                <span className="text-xs text-purple-600 font-mono font-bold">
                  {reassignModalOrder.trackingId}
                </span>
              </div>
              <button
                onClick={() => setReassignModalOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reassignError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{reassignError}</span>
              </div>
            )}

            {reassignSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{reassignSuccess}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div><strong>Current Status:</strong> <span className="font-semibold text-slate-700">{reassignModalOrder.status}</span></div>
              <div><strong>Cargo Weight:</strong> {reassignModalOrder.cargoDetails?.weightKg} kg {reassignModalOrder.cargoDetails?.isFragile ? '· ⚠️ Fragile' : ''}</div>
              <div><strong>Current Assignment:</strong> {reassignModalOrder.assignment?.driverId?.name || 'Assigned Driver'} with {reassignModalOrder.assignment?.vehicleId?.name || 'Assigned Vehicle'}</div>
            </div>

            <form onSubmit={handleReassignSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select New Delivery Driver</label>
                <select
                  value={reassignDriverId}
                  onChange={(e) => setReassignDriverId(e.target.value)}
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select New Fleet Vehicle</label>
                <select
                  value={reassignVehicleId}
                  onChange={(e) => setReassignVehicleId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                  required
                >
                  {vehicles.map((v) => (
                    <option key={v.vehicleId} value={v.vehicleId}>
                      {v.name} ({v.type}) — Cap: {v.currentLoadKg || 0}/{v.maxWeightKg} kg ({v.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Reassignment</label>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="e.g. Driver swap, vehicle battery recharge"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReassignModalOrder(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassigning}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {reassigning ? 'Reassigning Load...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Timeline Modal */}
      {timelineOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600" />
                  <span>Order Audit Timeline</span>
                </h3>
                <span className="text-xs text-blue-600 font-mono font-bold">
                  {timelineOrder.trackingId}
                </span>
              </div>
              <button
                onClick={() => setTimelineOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1 text-xs">
              {(!timelineOrder.statusHistory || timelineOrder.statusHistory.length === 0) ? (
                <div className="py-8 text-center text-slate-400">No timeline entries recorded</div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {timelineOrder.statusHistory.map((item, index) => (
                    <div key={item._id || index} className="relative group">
                      <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-white"></span>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 px-2 py-0.5 rounded-full text-[10px] bg-white border border-slate-200">
                            {item.status?.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {item.note && (
                          <p className="text-slate-600 text-[11px] font-medium pt-1">
                            {item.note}
                          </p>
                        )}
                        {item.updatedBy && (
                          <div className="text-[10px] text-slate-400">
                            Action by: {item.updatedBy?.name || item.updatedBy?.email || 'System / Authorized User'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setTimelineOrder(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Fleet & Nodes Modal */}
      {manageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 space-y-4 animate-in fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-600" />
                  <span>Campus Logistics Administration</span>
                </h3>
                <span className="text-xs text-slate-400">Manage vehicle maintenance and campus building access</span>
              </div>
              <button
                onClick={() => setManageModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error & Success Messages */}
            {manageError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{manageError}</span>
              </div>
            )}
            {manageSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{manageSuccess}</span>
              </div>
            )}

            {/* Sub-tabs: Vehicles vs Nodes */}
            <div className="flex items-center gap-4 border-b border-slate-200 text-xs font-bold">
              <button
                onClick={() => { setManageTab('vehicles'); setManageError(''); setManageSuccess(''); }}
                className={`pb-2 border-b-2 cursor-pointer transition ${
                  manageTab === 'vehicles' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'
                }`}
              >
                Fleet Vehicles ({vehicles.length})
              </button>
              <button
                onClick={() => { setManageTab('nodes'); setManageError(''); setManageSuccess(''); }}
                className={`pb-2 border-b-2 cursor-pointer transition ${
                  manageTab === 'nodes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'
                }`}
              >
                Campus Buildings / Nodes ({nodes.length})
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1 text-xs">
              {manageTab === 'vehicles' && (
                <div className="space-y-4">
                  {/* Register New Vehicle Form */}
                  <form onSubmit={handleCreateVehicle} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Register New Campus Fleet Vehicle</span>
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">Vehicle Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Solar Eco-Cart 3"
                          value={vehicleForm.name}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">Vehicle Class *</label>
                        <select
                          value={vehicleForm.type}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, type: e.target.value })}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="ECART">⚡ Electric Cart (ECART)</option>
                          <option value="CARGO_BIKE">🚲 Cargo Bike</option>
                          <option value="HAND_TROLLEY">🛒 Heavy Hand Trolley</option>
                          <option value="VAN">🚐 Utility Van</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">Reg Number *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. KA-01-EC-999"
                          value={vehicleForm.registrationNumber}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, registrationNumber: e.target.value })}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">Max Payload (kg) *</label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="any"
                          value={vehicleForm.maxWeightKg}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, maxWeightKg: e.target.value })}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={creatingVehicle}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer transition disabled:opacity-50"
                      >
                        {creatingVehicle ? 'Registering...' : 'Add Vehicle to Fleet'}
                      </button>
                    </div>
                  </form>

                  {/* Existing Vehicles List */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-700">Existing Vehicles ({vehicles.length})</h4>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {vehicles.map((v) => (
                        <div key={v.vehicleId} className="p-3 bg-white flex items-center justify-between hover:bg-slate-50 transition">
                          <div>
                            <span className="font-bold text-slate-900 block">{v.name} ({v.type})</span>
                            <span className="text-[10px] text-slate-400 font-mono">{v.vehicleId} · {v.registrationNumber} · Cap: {v.currentLoadKg || 0}/{v.maxWeightKg}kg</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              v.status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              v.status === 'IN_TRANSIT' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {v.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleMaintenance(v)}
                              disabled={togglingVehicleId === v._id}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer transition"
                            >
                              {v.status === 'MAINTENANCE' ? 'Set Available' : 'Toggle Maint.'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {manageTab === 'nodes' && (
                <div className="space-y-4">
                  {/* Add New Node Form */}
                  <form onSubmit={handleCreateNode} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Add New 3D Campus Building</span>
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">Building Hub ID (Code) *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. ROBOTICS-LAB"
                          value={nodeForm.hubId}
                          onChange={(e) => setNodeForm({ ...nodeForm, hubId: e.target.value })}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">Building Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Advanced Robotics Huddle"
                          value={nodeForm.name}
                          onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">Campus Zone *</label>
                        <select
                          value={nodeForm.zone}
                          onChange={(e) => setNodeForm({ ...nodeForm, zone: e.target.value })}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="ACADEMIC">ACADEMIC</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="HOSTEL">HOSTEL</option>
                          <option value="SPORTS">SPORTS</option>
                          <option value="UTILITY">UTILITY</option>
                        </select>
                      </div>
                      <div className="pt-4">
                        <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={nodeForm.isPedestrianOnly}
                            onChange={(e) => setNodeForm({ ...nodeForm, isPedestrianOnly: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                          <span>Pedestrian Only Zone (Restricts Vans)</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">3D Grid Position (x, y)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            placeholder="x"
                            value={nodeForm.x}
                            onChange={(e) => setNodeForm({ ...nodeForm, x: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            type="number"
                            placeholder="y"
                            value={nodeForm.y}
                            onChange={(e) => setNodeForm({ ...nodeForm, y: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">3D Dimensions (w, d, h)</label>
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="number"
                            placeholder="w"
                            value={nodeForm.width}
                            onChange={(e) => setNodeForm({ ...nodeForm, width: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            type="number"
                            placeholder="d"
                            value={nodeForm.depth}
                            onChange={(e) => setNodeForm({ ...nodeForm, depth: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            type="number"
                            placeholder="h"
                            value={nodeForm.height}
                            onChange={(e) => setNodeForm({ ...nodeForm, height: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={creatingNode}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer transition disabled:opacity-50"
                      >
                        {creatingNode ? 'Adding...' : 'Add Building to Campus Map'}
                      </button>
                    </div>
                  </form>

                  {/* Campus Nodes List */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-700">Campus Buildings ({nodes.length})</h4>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                      {nodes.map((n) => (
                        <div key={n.hubId} className="p-3 bg-white flex items-center justify-between hover:bg-slate-50 transition">
                          <div>
                            <span className="font-bold text-slate-900 block">{n.name} ({n.zone})</span>
                            <span className="text-[10px] text-slate-400 font-mono">{n.hubId} · Position: ({n.mapPosition?.x}, {n.mapPosition?.y})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              n.isPedestrianOnly ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {n.isPedestrianOnly ? '🚶 Pedestrian Only' : '🚗 All Fleet'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleTogglePedestrian(n)}
                              disabled={togglingNodeId === n._id}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer transition"
                            >
                              Toggle
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setManageModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
