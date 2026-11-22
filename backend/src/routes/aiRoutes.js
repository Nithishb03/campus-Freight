const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const aiService = require('../services/aiService');
const { DeliveryHub, DeliveryVehicle, DeliveryAgent } = require('../models/Delivery');
const Order = require('../models/Order');
const { protect, authorizeRoles } = require('../middleware/auth');

// Protect all AI routes with JWT authentication
router.use(protect);

/**
 * POST /api/ai/optimize-route
 * Roles: driver, admin, mailroom
 * Optimizes route for multiple order stops with priority and Haversine distance
 */
router.post(
  '/optimize-route',
  authorizeRoles('driver', 'admin', 'mailroom'),
  async (req, res) => {
    try {
      let { startHubId = 'MAIN-MAILROOM', orderIds, vehicleType } = req.body;

      // If driver and orderIds omitted, pull driver's active assigned orders
      if (!orderIds && req.user.role === 'driver') {
        const agent = await DeliveryAgent.findOne({ userId: req.user._id });
        if (agent) {
          orderIds = agent.assignedOrders || [];
          if (!vehicleType && agent.assignedVehicleId) {
            const vehicle = await DeliveryVehicle.findOne({ vehicleId: agent.assignedVehicleId });
            if (vehicle) vehicleType = vehicle.type;
          }
        }
      }

      // Fetch starting hub
      const startHub = (await DeliveryHub.findOne({
        $or: [{ hubId: startHubId }, { code: startHubId }, { aliases: startHubId }]
      })) || {
        hubId: 'MAIN-MAILROOM',
        code: 'MAIN-MAILROOM',
        name: 'Main Entrance & Mailroom',
        zone: 'ADMIN',
        mapPosition: { x: 420, y: 80, z: 0 },
        dimensions: { width: 90, depth: 45, height: 25 },
        coordinates: { lat: 12.9258, lng: 77.4983 }
      };

      // Fetch orders
      let orders = [];
      if (Array.isArray(orderIds) && orderIds.length > 0) {
        const validObjectIds = orderIds.filter((id) => mongoose.isValidObjectId(id));
        orders = await Order.find({
          $or: [
            { _id: { $in: validObjectIds } },
            { trackingId: { $in: orderIds } }
          ]
        });
      }

      // Fetch active campus hubs to lookup dropoff coordinates and 3D mapPosition
      const hubs = await DeliveryHub.find({ isActive: true });
      const hubMap = new Map();
      hubs.forEach((h) => {
        hubMap.set(h.hubId, h);
        if (h.code) hubMap.set(h.code, h);
        if (Array.isArray(h.aliases)) {
          h.aliases.forEach((alias) => hubMap.set(alias, h));
        }
      });

      // Construct stops array with 3D mapPosition & dimensions
      const stops = orders.map((order) => {
        const hubId = order.dropoffNode?.hubId || order.dropoffNode?.code;
        const matchedHub = hubMap.get(hubId);
        return {
          orderId: order._id,
          trackingId: order.trackingId,
          hubId: hubId,
          code: matchedHub?.code || hubId,
          buildingName: order.dropoffNode?.buildingName || matchedHub?.name || hubId,
          zone: matchedHub?.zone || 'ACADEMIC',
          mapPosition: matchedHub?.mapPosition || { x: 420, y: 80, z: 0 },
          dimensions: matchedHub?.dimensions || { width: 80, depth: 60, height: 35 },
          coordinates: matchedHub?.coordinates || startHub.coordinates,
          priority: order.priority || 'STANDARD',
          isFragile: Boolean(order.cargoDetails?.isFragile)
        };
      });

      const optimization = await aiService.optimizeCampusRoute({
        startHub,
        stops,
        vehicleType: vehicleType || 'ECART'
      });

      res.status(200).json({
        success: true,
        data: optimization
      });
    } catch (error) {
      console.error('Error optimizing campus route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to optimize campus route',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/ai/recommend-dispatch
 * Roles: requester, admin, mailroom
 * Evaluates building pedestrian restrictions & load capacity to recommend best fleet vehicle
 */
router.post(
  '/recommend-dispatch',
  authorizeRoles('requester', 'admin', 'mailroom'),
  async (req, res) => {
    try {
      const {
        pickupHubId,
        dropoffHubId,
        weightKg = 0,
        isFragile = false,
        priority = 'STANDARD'
      } = req.body;

      if (!pickupHubId || !dropoffHubId) {
        return res.status(400).json({
          success: false,
          message: 'Both pickupHubId and dropoffHubId are required'
        });
      }

      // Fetch pickup and dropoff hubs
      const [pickupNode, dropoffNode, availableVehicles] = await Promise.all([
        DeliveryHub.findOne({
          $or: [{ hubId: pickupHubId }, { code: pickupHubId }, { aliases: pickupHubId }],
          isActive: true
        }),
        DeliveryHub.findOne({
          $or: [{ hubId: dropoffHubId }, { code: dropoffHubId }, { aliases: dropoffHubId }],
          isActive: true
        }),
        DeliveryVehicle.find({ isActive: true })
      ]);

      if (!pickupNode) {
        return res.status(400).json({
          success: false,
          message: `Pickup node '${pickupHubId}' not found or inactive`
        });
      }

      if (!dropoffNode) {
        return res.status(400).json({
          success: false,
          message: `Dropoff node '${dropoffHubId}' not found or inactive`
        });
      }

      const recommendation = await aiService.recommendDispatch({
        pickupNode,
        dropoffNode,
        weightKg: Number(weightKg) || 0,
        isFragile: Boolean(isFragile),
        priority,
        availableVehicles
      });

      res.status(200).json({
        success: true,
        data: recommendation
      });
    } catch (error) {
      console.error('Error recommending vehicle dispatch:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to recommend vehicle dispatch',
        error: error.message
      });
    }
  }
);

module.exports = router;
