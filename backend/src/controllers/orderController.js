const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { DeliveryHub, DeliveryVehicle, DeliveryAgent } = require('../models/Delivery');

/**
 * Helper to generate a unique CFR tracking ID (e.g. CFR-A1B2C3)
 */
const generateTrackingId = () => {
  return `CFR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

/**
 * Helper to generate a 4-digit numeric OTP
 */
const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Real-time event emitter helper via Socket.io
 */
const emitRealTimeUpdate = (req, event, data) => {
  try {
    const io = req?.app?.get('io');
    if (io) {
      io.emit(event, data);
    }
  } catch (err) {
    // Graceful no-op in headless test execution
  }
};

/**
 * Strict Allowed Order Status State Transitions
 */
const VALID_TRANSITIONS = {
  PENDING_APPROVAL: ['PENDING', 'CANCELLED'],
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'DELIVERY_ATTEMPTED', 'RETURNED_TO_MAILROOM', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'DELIVERED', 'DELIVERY_ATTEMPTED', 'RETURNED_TO_MAILROOM', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'DELIVERY_ATTEMPTED', 'RETURNED_TO_MAILROOM', 'CANCELLED'],
  DELIVERY_ATTEMPTED: ['IN_TRANSIT', 'DELIVERED', 'RETURNED_TO_MAILROOM', 'CANCELLED'],
  RETURNED_TO_MAILROOM: ['ASSIGNED', 'CANCELLED'],
  DELIVERED: [], // Terminal
  CANCELLED: []  // Terminal
};

class OrderController {
  /**
   * POST /api/orders
   * Authenticated (requester, mailroom, admin)
   */
  async createOrder(req, res) {
    try {
      const {
        pickupNode,
        dropoffNode,
        cargoDetails,
        priority = 'STANDARD',
        externalTrackingId,
        estimatedDeliveryMinutes
      } = req.body;

      if (!pickupNode || !pickupNode.hubId || !dropoffNode || !dropoffNode.hubId) {
        return res.status(400).json({
          success: false,
          message: 'Both pickupNode and dropoffNode with hubId are required'
        });
      }

      if (!cargoDetails || !cargoDetails.itemCategory) {
        return res.status(400).json({
          success: false,
          message: 'Cargo details with itemCategory are required'
        });
      }

      // 1. Validate both hub nodes exist and are active DeliveryHubs
      const [pickupHub, dropoffHub] = await Promise.all([
        DeliveryHub.findOne({
          $or: [{ hubId: pickupNode.hubId }, { code: pickupNode.hubId }, { aliases: pickupNode.hubId }],
          isActive: true
        }),
        DeliveryHub.findOne({
          $or: [{ hubId: dropoffNode.hubId }, { code: dropoffNode.hubId }, { aliases: dropoffNode.hubId }],
          isActive: true
        })
      ]);

      if (!pickupHub) {
        return res.status(400).json({
          success: false,
          message: `Pickup node '${pickupNode.hubId}' does not exist as an active DeliveryHub`
        });
      }

      if (!dropoffHub) {
        return res.status(400).json({
          success: false,
          message: `Dropoff node '${dropoffNode.hubId}' does not exist as an active DeliveryHub`
        });
      }

      // Fill building names if not provided
      const resolvedPickupNode = {
        hubId: pickupHub.hubId,
        buildingName: pickupNode.buildingName || pickupHub.name,
        roomNumber: pickupNode.roomNumber || '',
        contactPhone: pickupNode.contactPhone || req.user.phone || ''
      };

      const resolvedDropoffNode = {
        hubId: dropoffHub.hubId,
        buildingName: dropoffNode.buildingName || dropoffHub.name,
        roomNumber: dropoffNode.roomNumber || '',
        recipientName: dropoffNode.recipientName || 'Campus Recipient',
        recipientPhone: dropoffNode.recipientPhone || pickupNode.contactPhone || ''
      };

      // 2. Generate trackingId & OTP
      let trackingId = generateTrackingId();
      // Ensure unique trackingId
      while (await Order.findOne({ trackingId })) {
        trackingId = generateTrackingId();
      }

      const otp = generateOtp();

      // 3. Fragile/Heavy Guardrail
      const isFragile = Boolean(cargoDetails.isFragile);
      const weightKg = Number(cargoDetails.weightKg) || 0;
      const requiresAdminApproval = isFragile === true || weightKg > 50;
      const status = requiresAdminApproval ? 'PENDING_APPROVAL' : 'PENDING';

      const resolvedCargoDetails = {
        itemCategory: cargoDetails.itemCategory,
        description: cargoDetails.description || '',
        weightKg: weightKg,
        dimensionsCm: cargoDetails.dimensionsCm || { length: 0, width: 0, height: 0 },
        isFragile: isFragile,
        requiresAdminApproval: requiresAdminApproval,
        specialInstructions: cargoDetails.specialInstructions || ''
      };

      // 4. Create and save order
      const order = new Order({
        trackingId,
        requesterId: req.user._id,
        status,
        priority,
        pickupNode: resolvedPickupNode,
        dropoffNode: resolvedDropoffNode,
        cargoDetails: resolvedCargoDetails,
        externalTrackingId,
        estimatedDeliveryMinutes: estimatedDeliveryMinutes || 30,
        pod: {
          otp,
          isVerified: false
        },
        statusHistory: [
          {
            status,
            updatedBy: req.user._id,
            note: requiresAdminApproval
              ? 'Order submitted and requires admin approval (fragile cargo or weight > 50kg)'
              : 'Order submitted and pending driver assignment',
            timestamp: new Date()
          }
        ]
      });

      await order.save();

      emitRealTimeUpdate(req, 'order:updated', { action: 'created', order });
      emitRealTimeUpdate(req, 'fleet:updated', { action: 'order_created' });

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: order
      });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create order',
        error: error.message
      });
    }
  }

  /**
   * GET /api/orders
   * Authenticated (Role-aware filtering)
   */
  async getOrders(req, res) {
    try {
      const { status, priority, limit = 50, page = 1 } = req.query;
      const query = {};

      if (status) query.status = status;
      if (priority) query.priority = priority;

      // Role-based scoping
      if (req.user.role === 'requester') {
        query.requesterId = req.user._id;
      } else if (req.user.role === 'driver') {
        const agent = await DeliveryAgent.findOne({ userId: req.user._id });
        if (!agent) {
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
            pagination: { currentPage: 1, totalPages: 0, totalOrders: 0 }
          });
        }
        query.$or = [
          { 'assignment.driverId': agent._id },
          { _id: { $in: agent.assignedOrders } }
        ];
      }
      // admin and mailroom see all orders matching query

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [orders, total] = await Promise.all([
        Order.find(query)
          .populate('requesterId', 'name email phone campusId department')
          .populate('assignment.driverId', 'agentId name phone assignedZone status')
          .populate('assignment.vehicleId', 'vehicleId name type registrationNumber maxWeightKg currentLoadKg')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Order.countDocuments(query)
      ]);

      res.status(200).json({
        success: true,
        count: orders.length,
        data: orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalOrders: total
        }
      });
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve orders',
        error: error.message
      });
    }
  }

  /**
   * GET /api/orders/analytics/summary
   * Admin & Mailroom only
   */
  async getOrderAnalyticsSummary(req, res) {
    try {
      const statuses = [
        'PENDING_APPROVAL',
        'PENDING',
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'DELIVERED',
        'DELIVERY_ATTEMPTED',
        'RETURNED_TO_MAILROOM',
        'CANCELLED'
      ];

      // Aggregations
      const [statusCounts, activeCargoWeightAgg, vehicles, busiestHubsAgg, fleetTypeAgg] = await Promise.all([
        Order.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Order.aggregate([
          {
            $match: {
              status: { $in: ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] }
            }
          },
          {
            $group: {
              _id: null,
              totalActiveWeight: { $sum: '$cargoDetails.weightKg' }
            }
          }
        ]),
        DeliveryVehicle.find({ isActive: true }),
        // Top 5 Busiest Campus Buildings by Combined Pickup & Dropoff Traffic
        Order.aggregate([
          {
            $project: {
              nodes: [
                { hubId: '$pickupNode.hubId', buildingName: '$pickupNode.buildingName' },
                { hubId: '$dropoffNode.hubId', buildingName: '$dropoffNode.buildingName' }
              ]
            }
          },
          { $unwind: '$nodes' },
          {
            $group: {
              _id: '$nodes.hubId',
              hubId: { $first: '$nodes.hubId' },
              buildingName: { $first: '$nodes.buildingName' },
              totalTrips: { $sum: 1 }
            }
          },
          { $sort: { totalTrips: -1 } },
          { $limit: 5 }
        ]),
        // Fleet Utilization & Deliveries by Vehicle Type
        Order.aggregate([
          { $match: { 'assignment.vehicleId': { $exists: true, $ne: null } } },
          {
            $lookup: {
              from: 'deliveryvehicles',
              localField: 'assignment.vehicleId',
              foreignField: '_id',
              as: 'vehicle'
            }
          },
          { $unwind: '$vehicle' },
          {
            $group: {
              _id: '$vehicle.type',
              type: { $first: '$vehicle.type' },
              totalDeliveries: { $sum: 1 },
              totalWeightKg: { $sum: '$cargoDetails.weightKg' },
              completedDeliveries: {
                $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] }
              }
            }
          }
        ])
      ]);

      // Map status counts
      const countsByStatus = {};
      statuses.forEach((s) => {
        countsByStatus[s] = 0;
      });
      statusCounts.forEach((item) => {
        if (item._id) countsByStatus[item._id] = item.count;
      });

      // Format ordersByStatus array for charts
      const ordersByStatus = statuses
        .filter((s) => countsByStatus[s] > 0 || ['DELIVERED', 'IN_TRANSIT', 'ASSIGNED', 'PENDING'].includes(s))
        .map((s) => ({
          status: s,
          label: s.replace('_', ' '),
          count: countsByStatus[s]
        }));

      // Format Busiest Buildings
      const busiestHubs = (busiestHubsAgg || []).map((b) => ({
        hubId: b.hubId || b._id,
        buildingName: b.buildingName || b._id,
        totalTrips: b.totalTrips || 0
      }));

      // Format Fleet by Vehicle Type
      const vehicleTypes = ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'];
      const fleetTypeMap = {};
      vehicleTypes.forEach((t) => {
        fleetTypeMap[t] = {
          type: t,
          totalDeliveries: 0,
          totalWeightKg: 0,
          completedDeliveries: 0
        };
      });
      (fleetTypeAgg || []).forEach((f) => {
        if (f.type && fleetTypeMap[f.type]) {
          fleetTypeMap[f.type] = {
            type: f.type,
            totalDeliveries: f.totalDeliveries || 0,
            totalWeightKg: Math.round(f.totalWeightKg || 0),
            completedDeliveries: f.completedDeliveries || 0
          };
        }
      });
      const fleetUtilizationByType = Object.values(fleetTypeMap);

      // Green Logistics Metrics
      const zeroEmissionTypes = ['ECART', 'CARGO_BIKE', 'HAND_TROLLEY'];
      const zeroEmissionTrips = fleetUtilizationByType
        .filter((f) => zeroEmissionTypes.includes(f.type))
        .reduce((sum, f) => sum + f.totalDeliveries, 0);
      const conventionalTrips = fleetTypeMap['VAN']?.totalDeliveries || 0;
      const totalAssignedTrips = zeroEmissionTrips + conventionalTrips;
      const greenTripPct = totalAssignedTrips > 0
        ? Number(((zeroEmissionTrips / totalAssignedTrips) * 100).toFixed(1))
        : 100.0;
      const co2SavedKg = Number((zeroEmissionTrips * 0.45).toFixed(1));

      const totalActiveCargoWeightKg = activeCargoWeightAgg[0]?.totalActiveWeight || 0;

      // Fleet utilization metrics
      const totalVehicles = vehicles.length;
      const inTransitVehicles = vehicles.filter((v) => v.status === 'IN_TRANSIT').length;
      const totalCapacityKg = vehicles.reduce((sum, v) => sum + (v.maxWeightKg || 0), 0);
      const currentLoadKg = vehicles.reduce((sum, v) => sum + (v.currentLoadKg || 0), 0);
      const fleetUtilizationPct = totalCapacityKg > 0
        ? Number(((currentLoadKg / totalCapacityKg) * 100).toFixed(1))
        : 0;

      res.status(200).json({
        success: true,
        data: {
          statusCounts: countsByStatus,
          ordersByStatus,
          totalOrders: Object.values(countsByStatus).reduce((a, b) => a + b, 0),
          totalActiveCargoWeightKg,
          busiestHubs,
          fleetUtilizationByType,
          greenLogistics: {
            zeroEmissionTrips,
            conventionalTrips,
            totalAssignedTrips,
            greenTripPct,
            co2SavedKg
          },
          fleet: {
            totalVehicles,
            inTransitVehicles,
            availableVehicles: vehicles.filter((v) => v.status === 'AVAILABLE').length,
            maintenanceVehicles: vehicles.filter((v) => v.status === 'MAINTENANCE').length,
            totalCapacityKg,
            currentLoadKg,
            fleetUtilizationPct
          }
        }
      });
    } catch (error) {
      console.error('Error calculating order analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate analytics summary',
        error: error.message
      });
    }
  }

  /**
   * GET /api/orders/:id
   * Single order lookup with populate
   */
  async getOrderById(req, res) {
    try {
      const { id } = req.params;

      const query = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { trackingId: id }] }
        : { trackingId: id };

      const order = await Order.findOne(query)
        .populate('requesterId', 'name email phone campusId department')
        .populate('assignment.driverId', 'agentId name phone assignedZone status')
        .populate('assignment.vehicleId', 'vehicleId name type registrationNumber maxWeightKg currentLoadKg');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Role check: requester can only view their own orders
      if (req.user.role === 'requester' && order.requesterId?._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have permission to view this order'
        });
      }

      res.status(200).json({
        success: true,
        data: order
      });
    } catch (error) {
      console.error('Error fetching order by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve order',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/orders/:id/approve
   * Admin / Mailroom only: Moves order from PENDING_APPROVAL to PENDING
   */
  async approveOrder(req, res) {
    try {
      const { id } = req.params;

      const query = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { trackingId: id }] }
        : { trackingId: id };

      const order = await Order.findOne(query);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      if (order.status !== 'PENDING_APPROVAL') {
        return res.status(400).json({
          success: false,
          message: `Cannot approve order with status '${order.status}'. Only 'PENDING_APPROVAL' orders can be approved.`
        });
      }

      order.status = 'PENDING';
      if (order.cargoDetails) {
        order.cargoDetails.requiresAdminApproval = false;
      }

      order.statusHistory.push({
        status: 'PENDING',
        updatedBy: req.user._id,
        note: `Approved by ${req.user.role} (${req.user.name})`,
        timestamp: new Date()
      });

      await order.save();

      emitRealTimeUpdate(req, 'order:updated', { action: 'approved', order });
      emitRealTimeUpdate(req, 'fleet:updated', { action: 'order_approved' });

      res.status(200).json({
        success: true,
        message: 'Order approved successfully and is now ready for assignment',
        data: order
      });
    } catch (error) {
      console.error('Error approving order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to approve order',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/orders/:id/assign
   * Admin / Mailroom: Assign driver & vehicle with strict guardrails
   */
  async assignOrder(req, res) {
    try {
      const { id } = req.params;
      const { driverId, vehicleId } = req.body;

      if (!driverId || !vehicleId) {
        return res.status(400).json({
          success: false,
          message: 'Both driverId and vehicleId are required'
        });
      }

      // Find order
      const orderQuery = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { trackingId: id }] }
        : { trackingId: id };

      const order = await Order.findOne(orderQuery);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Guardrail 1: Approval & State Check
      if (order.status === 'PENDING_APPROVAL') {
        return res.status(400).json({
          success: false,
          message: 'Cannot assign order pending approval. Please approve the order first.'
        });
      }

      if (order.status !== 'PENDING' && order.status !== 'RETURNED_TO_MAILROOM') {
        return res.status(400).json({
          success: false,
          message: `Cannot assign order with status '${order.status}'. Please use reassign if already assigned, or verify order state.`
        });
      }

      // Find driver & vehicle
      const driverQuery = mongoose.isValidObjectId(driverId)
        ? { $or: [{ _id: driverId }, { agentId: driverId }] }
        : { agentId: driverId };

      const vehicleQuery = mongoose.isValidObjectId(vehicleId)
        ? { $or: [{ _id: vehicleId }, { vehicleId }] }
        : { vehicleId };

      const [driver, vehicle] = await Promise.all([
        DeliveryAgent.findOne(driverQuery),
        DeliveryVehicle.findOne(vehicleQuery)
      ]);

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: `Delivery agent '${driverId}' not found`
        });
      }

      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: `Delivery vehicle '${vehicleId}' not found`
        });
      }

      // Guardrail 2: Pedestrian/Zone Accessibility Check
      const [pickupHub, dropoffHub] = await Promise.all([
        DeliveryHub.findOne({
          $or: [{ hubId: order.pickupNode.hubId }, { code: order.pickupNode.hubId }, { aliases: order.pickupNode.hubId }]
        }),
        DeliveryHub.findOne({
          $or: [{ hubId: order.dropoffNode.hubId }, { code: order.dropoffNode.hubId }, { aliases: order.dropoffNode.hubId }]
        })
      ]);

      if (!pickupHub || !dropoffHub) {
        return res.status(400).json({
          success: false,
          message: 'Pickup or dropoff hub not found for accessibility validation'
        });
      }

      if (!pickupHub.accessibleBy.includes(vehicle.type)) {
        return res.status(400).json({
          success: false,
          message: `Vehicle type '${vehicle.type}' is restricted at pickup building '${pickupHub.name}' (${pickupHub.hubId}). Accessible by: ${pickupHub.accessibleBy.join(', ')}`
        });
      }

      if (!dropoffHub.accessibleBy.includes(vehicle.type)) {
        return res.status(400).json({
          success: false,
          message: `Vehicle type '${vehicle.type}' is restricted at dropoff building '${dropoffHub.name}' (${dropoffHub.hubId}). Accessible by: ${dropoffHub.accessibleBy.join(', ')}`
        });
      }

      // Guardrail 3: Atomic Weight Capacity Check
      const orderWeight = order.cargoDetails?.weightKg || 0;

      const updatedVehicle = await DeliveryVehicle.findOneAndUpdate(
        {
          _id: vehicle._id,
          status: { $ne: 'MAINTENANCE' },
          $expr: {
            $lte: [{ $add: ['$currentLoadKg', orderWeight] }, '$maxWeightKg']
          }
        },
        {
          $inc: { currentLoadKg: orderWeight },
          $addToSet: { assignedOrders: order._id }
        },
        { new: true }
      );

      if (!updatedVehicle) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle capacity exceeded or unavailable'
        });
      }

      // Update Order Assignment
      order.assignment = {
        driverId: driver._id,
        vehicleId: vehicle._id,
        assignedAt: new Date()
      };
      order.status = 'ASSIGNED';
      order.statusHistory.push({
        status: 'ASSIGNED',
        updatedBy: req.user._id,
        note: `Assigned to driver ${driver.name} with vehicle ${vehicle.name} (${vehicle.type})`,
        timestamp: new Date()
      });

      await order.save();

      emitRealTimeUpdate(req, 'order:updated', { action: 'assigned', order });
      emitRealTimeUpdate(req, 'fleet:updated', { action: 'order_assigned' });

      // Update Driver assignedOrders and status
      await DeliveryAgent.findByIdAndUpdate(driver._id, {
        $addToSet: { assignedOrders: order._id },
        assignedVehicleId: vehicle.vehicleId,
        status: 'ON_DELIVERY'
      });

      res.status(200).json({
        success: true,
        message: 'Order assigned successfully',
        data: order
      });
    } catch (error) {
      console.error('Error assigning order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign order',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/orders/:id/status
   * Driver, Admin, Mailroom: Status updates & OTP Proof of Delivery
   */
  async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, otp, deliveryNotes, failedReason } = req.body;

      const allowedStatuses = [
        'PICKED_UP',
        'IN_TRANSIT',
        'DELIVERED',
        'DELIVERY_ATTEMPTED',
        'RETURNED_TO_MAILROOM',
        'CANCELLED'
      ];

      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`
        });
      }

      // Find order
      const orderQuery = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { trackingId: id }] }
        : { trackingId: id };

      const order = await Order.findOne(orderQuery);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Strict State Machine Transition Check
      if (!VALID_TRANSITIONS[order.status] || !VALID_TRANSITIONS[order.status].includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from '${order.status}' to '${status}'. Allowed transitions: ${
            (VALID_TRANSITIONS[order.status] || []).join(', ') || 'none (terminal state)'
          }`
        });
      }

      // Driver authorization check
      if (req.user.role === 'driver') {
        const agent = await DeliveryAgent.findOne({ userId: req.user._id });
        if (!agent || !order.assignment?.driverId || order.assignment.driverId.toString() !== agent._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: You are only authorized to update orders assigned to you'
          });
        }
      }

      // Guardrail 4: OTP Proof of Delivery
      if (status === 'DELIVERED') {
        if (!otp || String(otp).trim() !== String(order.pod?.otp).trim()) {
          return res.status(400).json({
            success: false,
            message: 'Invalid Proof of Delivery OTP'
          });
        }

        order.pod.isVerified = true;
        order.pod.verifiedAt = new Date();
        if (deliveryNotes) order.pod.deliveryNotes = deliveryNotes;

        // Atomically release vehicle load with safe floor guard (currentLoadKg >= 0)
        if (order.assignment?.vehicleId) {
          const weightToRelease = Number(order.cargoDetails?.weightKg || 0);
          await DeliveryVehicle.findByIdAndUpdate(order.assignment.vehicleId, [
            {
              $set: {
                currentLoadKg: { $max: [0, { $subtract: ['$currentLoadKg', weightToRelease] }] },
                assignedOrders: {
                  $filter: {
                    input: '$assignedOrders',
                    as: 'item',
                    cond: { $ne: ['$$item', order._id] }
                  }
                }
              }
            }
          ]);
        }

        // Release order from driver
        if (order.assignment?.driverId) {
          await DeliveryAgent.findByIdAndUpdate(order.assignment.driverId, {
            $pull: { assignedOrders: order._id },
            status: 'AVAILABLE'
          });
        }
      }

      // Guardrail 5: Failed Delivery Reason
      if (status === 'DELIVERY_ATTEMPTED' || status === 'RETURNED_TO_MAILROOM') {
        if (!failedReason || !failedReason.trim()) {
          return res.status(400).json({
            success: false,
            message: 'Failed reason is required for delivery attempted or returned to mailroom status'
          });
        }
        order.pod.failedReason = failedReason.trim();
      }

      // If marked CANCELLED through status endpoint, ensure load release with floor guard
      if (status === 'CANCELLED' && order.assignment?.vehicleId) {
        const weightToRelease = Number(order.cargoDetails?.weightKg || 0);
        await DeliveryVehicle.findByIdAndUpdate(order.assignment.vehicleId, [
          {
            $set: {
              currentLoadKg: { $max: [0, { $subtract: ['$currentLoadKg', weightToRelease] }] },
              assignedOrders: {
                $filter: {
                  input: '$assignedOrders',
                  as: 'item',
                  cond: { $ne: ['$$item', order._id] }
                }
              }
            }
          }
        ]);
        if (order.assignment?.driverId) {
          await DeliveryAgent.findByIdAndUpdate(order.assignment.driverId, {
            $pull: { assignedOrders: order._id }
          });
        }
      }

      order.status = status;
      order.statusHistory.push({
        status,
        updatedBy: req.user._id,
        note: deliveryNotes || failedReason || `Status updated to ${status}`,
        timestamp: new Date()
      });

      await order.save();

      emitRealTimeUpdate(req, 'order:updated', { action: 'status_updated', order });
      emitRealTimeUpdate(req, 'fleet:updated', { action: 'order_status_updated' });

      res.status(200).json({
        success: true,
        message: `Order status updated to '${status}' successfully`,
        data: order
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update order status',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/orders/:id/cancel
   * Requester (before pickup) or Admin/Mailroom (before delivery)
   */
  async cancelOrder(req, res) {
    try {
      const { id } = req.params;
      const { reason = 'Order cancelled by user' } = req.body;

      const orderQuery = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { trackingId: id }] }
        : { trackingId: id };

      const order = await Order.findOne(orderQuery);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      if (order.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Order is already cancelled'
        });
      }

      if (order.status === 'DELIVERED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel an order that has already been delivered'
        });
      }

      // Requester authorization & timing check
      if (req.user.role === 'requester') {
        if (order.requesterId.toString() !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: You can only cancel your own orders'
          });
        }
        const allowedToCancel = ['PENDING_APPROVAL', 'PENDING', 'ASSIGNED'];
        if (!allowedToCancel.includes(order.status)) {
          return res.status(400).json({
            success: false,
            message: `Requesters can only cancel orders before pickup. Current status: '${order.status}'`
          });
        }
      }

      // Safe rollback of vehicle load if vehicle was assigned
      if (order.assignment?.vehicleId) {
        const weightToRelease = Number(order.cargoDetails?.weightKg || 0);
        await DeliveryVehicle.findByIdAndUpdate(order.assignment.vehicleId, [
          {
            $set: {
              currentLoadKg: { $max: [0, { $subtract: ['$currentLoadKg', weightToRelease] }] },
              assignedOrders: {
                $filter: {
                  input: '$assignedOrders',
                  as: 'item',
                  cond: { $ne: ['$$item', order._id] }
                }
              }
            }
          }
        ]);
      }

      // Remove from driver
      if (order.assignment?.driverId) {
        await DeliveryAgent.findByIdAndUpdate(order.assignment.driverId, {
          $pull: { assignedOrders: order._id }
        });
      }

      order.status = 'CANCELLED';
      order.statusHistory.push({
        status: 'CANCELLED',
        updatedBy: req.user._id,
        note: reason,
        timestamp: new Date()
      });

      await order.save();

      emitRealTimeUpdate(req, 'order:updated', { action: 'cancelled', order });
      emitRealTimeUpdate(req, 'fleet:updated', { action: 'order_cancelled' });

      res.status(200).json({
        success: true,
        message: 'Order cancelled successfully and fleet capacity rolled back',
        data: order
      });
    } catch (error) {
      console.error('Error cancelling order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel order',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/orders/:id/reassign
   * Admin / Mailroom: Reassign fleet driver & vehicle
   */
  async reassignOrder(req, res) {
    try {
      const { id } = req.params;
      const { driverId, vehicleId, reason = 'Fleet reassignment' } = req.body;

      if (!driverId || !vehicleId) {
        return res.status(400).json({
          success: false,
          message: 'Both driverId and vehicleId are required for reassignment'
        });
      }

      const orderQuery = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { trackingId: id }] }
        : { trackingId: id };

      const order = await Order.findOne(orderQuery);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot reassign order in terminal state '${order.status}'`
        });
      }

      if (order.status === 'PENDING_APPROVAL') {
        return res.status(400).json({
          success: false,
          message: 'Cannot reassign order pending approval. Please approve the order first.'
        });
      }

      // Find new driver & vehicle
      const driverQuery = mongoose.isValidObjectId(driverId)
        ? { $or: [{ _id: driverId }, { agentId: driverId }] }
        : { agentId: driverId };

      const vehicleQuery = mongoose.isValidObjectId(vehicleId)
        ? { $or: [{ _id: vehicleId }, { vehicleId }] }
        : { vehicleId };

      const [newDriver, newVehicle] = await Promise.all([
        DeliveryAgent.findOne(driverQuery),
        DeliveryVehicle.findOne(vehicleQuery)
      ]);

      if (!newDriver) {
        return res.status(404).json({
          success: false,
          message: `Delivery agent '${driverId}' not found`
        });
      }

      if (!newVehicle) {
        return res.status(404).json({
          success: false,
          message: `Delivery vehicle '${vehicleId}' not found`
        });
      }

      // Building accessibility check
      const [pickupHub, dropoffHub] = await Promise.all([
        DeliveryHub.findOne({
          $or: [{ hubId: order.pickupNode.hubId }, { code: order.pickupNode.hubId }, { aliases: order.pickupNode.hubId }]
        }),
        DeliveryHub.findOne({
          $or: [{ hubId: order.dropoffNode.hubId }, { code: order.dropoffNode.hubId }, { aliases: order.dropoffNode.hubId }]
        })
      ]);

      if (!pickupHub || !dropoffHub) {
        return res.status(400).json({
          success: false,
          message: 'Pickup or dropoff hub not found for accessibility validation'
        });
      }

      if (!pickupHub.accessibleBy.includes(newVehicle.type)) {
        return res.status(400).json({
          success: false,
          message: `Vehicle type '${newVehicle.type}' is restricted at pickup building '${pickupHub.name}'`
        });
      }

      if (!dropoffHub.accessibleBy.includes(newVehicle.type)) {
        return res.status(400).json({
          success: false,
          message: `Vehicle type '${newVehicle.type}' is restricted at dropoff building '${dropoffHub.name}'`
        });
      }

      const orderWeight = Number(order.cargoDetails?.weightKg || 0);
      const oldVehicleId = order.assignment?.vehicleId?.toString();
      const oldDriverId = order.assignment?.driverId?.toString();
      const newVehicleIdStr = newVehicle._id.toString();
      const newDriverIdStr = newDriver._id.toString();

      // If moving to a different vehicle, reserve capacity on new vehicle and release old vehicle
      if (oldVehicleId !== newVehicleIdStr) {
        const updatedNewVehicle = await DeliveryVehicle.findOneAndUpdate(
          {
            _id: newVehicle._id,
            status: { $ne: 'MAINTENANCE' },
            $expr: {
              $lte: [{ $add: ['$currentLoadKg', orderWeight] }, '$maxWeightKg']
            }
          },
          {
            $inc: { currentLoadKg: orderWeight },
            $addToSet: { assignedOrders: order._id }
          },
          { new: true }
        );

        if (!updatedNewVehicle) {
          return res.status(400).json({
            success: false,
            message: `New vehicle '${newVehicle.name}' cannot accommodate payload of ${orderWeight}kg (capacity exceeded)`
          });
        }

        // Release load from previous vehicle with floor guard
        if (oldVehicleId) {
          await DeliveryVehicle.findByIdAndUpdate(oldVehicleId, [
            {
              $set: {
                currentLoadKg: { $max: [0, { $subtract: ['$currentLoadKg', orderWeight] }] },
                assignedOrders: {
                  $filter: {
                    input: '$assignedOrders',
                    as: 'item',
                    cond: { $ne: ['$$item', order._id] }
                  }
                }
              }
            }
          ]);
        }
      }

      // Update old and new driver assignments
      if (oldDriverId && oldDriverId !== newDriverIdStr) {
        await DeliveryAgent.findByIdAndUpdate(oldDriverId, {
          $pull: { assignedOrders: order._id }
        });
      }
      await DeliveryAgent.findByIdAndUpdate(newDriver._id, {
        $addToSet: { assignedOrders: order._id },
        assignedVehicleId: newVehicle.vehicleId,
        status: 'ON_DELIVERY'
      });

      // Update Order Assignment
      order.assignment = {
        driverId: newDriver._id,
        vehicleId: newVehicle._id,
        assignedAt: new Date()
      };

      if (order.status === 'PENDING') {
        order.status = 'ASSIGNED';
      }

      order.statusHistory.push({
        status: order.status,
        updatedBy: req.user._id,
        note: `Reassigned to driver ${newDriver.name} with vehicle ${newVehicle.name} (${newVehicle.type}). Reason: ${reason}`,
        timestamp: new Date()
      });

      await order.save();

      emitRealTimeUpdate(req, 'order:updated', { action: 'reassigned', order });
      emitRealTimeUpdate(req, 'fleet:updated', { action: 'order_reassigned' });

      res.status(200).json({
        success: true,
        message: 'Order reassigned successfully and fleet loads updated',
        data: order
      });
    } catch (error) {
      console.error('Error reassigning order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reassign order',
        error: error.message
      });
    }
  }
}

module.exports = new OrderController();
