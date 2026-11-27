const crypto = require('crypto');
const { DeliveryHub, DeliveryVehicle, DeliveryAgent } = require('../models/Delivery');
const mongoose = require('mongoose');

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
    // Graceful no-op in test/headless
  }
};

/**
 * DeliveryController - Campus Nodes, Fleet Vehicles, and Drivers
 */
class DeliveryController {
  /**
   * GET /api/delivery/nodes
   * Return all active DeliveryHub campus nodes
   */
  async getCampusNodes(req, res) {
    try {
      const { zone, isMailroom } = req.query;
      const filter = { isActive: true };

      if (zone) filter.zone = zone;
      if (isMailroom !== undefined) filter.isMailroom = isMailroom === 'true';

      const nodes = await DeliveryHub.find(filter).sort({ name: 1 });

      res.status(200).json({
        success: true,
        count: nodes.length,
        data: nodes
      });
    } catch (error) {
      console.error('Error fetching campus nodes:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve campus nodes',
        error: error.message
      });
    }
  }

  /**
   * GET /api/delivery/nodes/:hubId
   */
  async getCampusNodeById(req, res) {
    try {
      const { hubId } = req.params;
      const node = await DeliveryHub.findOne({
        $or: [{ hubId }, { code: hubId }, { aliases: hubId }],
        isActive: true
      });

      if (!node) {
        return res.status(404).json({
          success: false,
          message: `Campus node '${hubId}' not found`
        });
      }

      res.status(200).json({
        success: true,
        data: node
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve campus node',
        error: error.message
      });
    }
  }

  /**
   * GET /api/delivery/vehicles
   * Return all active DeliveryVehicle fleet records
   */
  async getCampusVehicles(req, res) {
    try {
      const { status, type } = req.query;
      const filter = { isActive: true };

      if (status) filter.status = status;
      if (type) filter.type = type;

      const vehicles = await DeliveryVehicle.find(filter)
        .populate('assignedOrders', 'trackingId status priority cargoDetails.weightKg')
        .sort({ vehicleId: 1 });

      res.status(200).json({
        success: true,
        count: vehicles.length,
        data: vehicles
      });
    } catch (error) {
      console.error('Error fetching campus vehicles:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve campus vehicles',
        error: error.message
      });
    }
  }

  /**
   * GET /api/delivery/drivers
   * Return all active DeliveryAgent records populated with vehicle/order info (Admin/Mailroom)
   */
  async getDeliveryDrivers(req, res) {
    try {
      const { status, zone } = req.query;
      const filter = { isActive: true };

      if (status) filter.status = status;
      if (zone) filter.assignedZone = zone;

      const drivers = await DeliveryAgent.find(filter)
        .populate('userId', 'name email phone campusId department')
        .populate('assignedOrders', 'trackingId status priority cargoDetails pickupNode dropoffNode')
        .sort({ agentId: 1 });

      res.status(200).json({
        success: true,
        count: drivers.length,
        data: drivers
      });
    } catch (error) {
      console.error('Error fetching delivery drivers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve delivery drivers',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/delivery/drivers/:agentId/location
   * Update driver's currentLocation: { lat, lng, lastUpdated } (Driver/Admin)
   */
  async updateDriverLocation(req, res) {
    try {
      const { agentId } = req.params;
      const { lat, lng } = req.body.currentLocation || req.body;

      if (lat === undefined || lng === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Both lat and lng coordinates are required'
        });
      }

      // Find agent by agentId or _id
      const query = mongoose.isValidObjectId(agentId)
        ? { $or: [{ _id: agentId }, { agentId }] }
        : { agentId };

      const agent = await DeliveryAgent.findOne(query);

      if (!agent) {
        return res.status(404).json({
          success: false,
          message: `Delivery agent '${agentId}' not found`
        });
      }

      // If driver is updating, ensure they own this agent profile
      if (req.user.role === 'driver' && agent.userId && agent.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You can only update your own location'
        });
      }

      agent.currentLocation = {
        lat: Number(lat),
        lng: Number(lng),
        lastUpdated: new Date()
      };

      await agent.save();

      res.status(200).json({
        success: true,
        message: 'Driver location updated successfully',
        data: {
          agentId: agent.agentId,
          currentLocation: agent.currentLocation
        }
      });
    } catch (error) {
      console.error('Error updating driver location:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update driver location',
        error: error.message
      });
    }
  }

  /**
   * POST /api/vehicles or /api/delivery/vehicles
   * Admin / Mailroom: Register a new vehicle
   */
  async createCampusVehicle(req, res) {
    try {
      const {
        vehicleId,
        name,
        type,
        registrationNumber,
        maxWeightKg,
        currentHubId = 'MAIN-MAILROOM',
        status = 'AVAILABLE'
      } = req.body;

      if (!name || !type || !registrationNumber || maxWeightKg === undefined) {
        return res.status(400).json({
          success: false,
          message: 'name, type, registrationNumber, and maxWeightKg are required'
        });
      }

      const allowedTypes = ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'];
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid vehicle type '${type}'. Allowed: ${allowedTypes.join(', ')}`
        });
      }

      const generatedId = vehicleId || `VEH-${type}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      const existing = await DeliveryVehicle.findOne({
        $or: [{ vehicleId: generatedId }, { registrationNumber }]
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Vehicle with ID '${generatedId}' or registration '${registrationNumber}' already exists`
        });
      }

      const vehicle = new DeliveryVehicle({
        vehicleId: generatedId,
        name: name.trim(),
        type,
        registrationNumber: registrationNumber.trim(),
        maxWeightKg: Number(maxWeightKg),
        currentLoadKg: 0,
        status,
        currentHubId,
        assignedOrders: [],
        isActive: true
      });

      await vehicle.save();

      emitRealTimeUpdate(req, 'fleet:updated', { action: 'vehicle_created', vehicle });

      res.status(201).json({
        success: true,
        message: 'Vehicle created successfully',
        data: vehicle
      });
    } catch (error) {
      console.error('Error creating campus vehicle:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create campus vehicle',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/vehicles/:id or /api/delivery/vehicles/:id
   * Admin / Mailroom: Update max weight or status (AVAILABLE / MAINTENANCE)
   * Guardrail: Cannot set to MAINTENANCE if active assigned orders exist
   */
  async updateCampusVehicle(req, res) {
    try {
      const { id } = req.params;
      const { maxWeightKg, status, name, currentHubId, isActive } = req.body;

      const query = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { vehicleId: id }] }
        : { vehicleId: id };

      const vehicle = await DeliveryVehicle.findOne(query);
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: `Vehicle '${id}' not found`
        });
      }

      // Guardrail: Block setting to MAINTENANCE if active assigned orders or payload exist
      if (status === 'MAINTENANCE') {
        const hasAssignedOrders = (vehicle.assignedOrders && vehicle.assignedOrders.length > 0) || (vehicle.currentLoadKg > 0);
        if (hasAssignedOrders) {
          return res.status(400).json({
            success: false,
            message: `Cannot set vehicle '${vehicle.name}' (${vehicle.vehicleId}) to MAINTENANCE while it has active assigned orders or active payload (${vehicle.currentLoadKg}kg). Please reassign or complete orders first.`
          });
        }
      }

      if (status !== undefined) {
        const allowedStatuses = ['AVAILABLE', 'IN_TRANSIT', 'MAINTENANCE'];
        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            message: `Invalid status '${status}'. Allowed: ${allowedStatuses.join(', ')}`
          });
        }
        vehicle.status = status;
      }

      if (maxWeightKg !== undefined) {
        const newMax = Number(maxWeightKg);
        if (isNaN(newMax) || newMax <= 0) {
          return res.status(400).json({
            success: false,
            message: 'maxWeightKg must be a positive number'
          });
        }
        if (newMax < vehicle.currentLoadKg) {
          return res.status(400).json({
            success: false,
            message: `Cannot reduce max weight below current load (${vehicle.currentLoadKg}kg)`
          });
        }
        vehicle.maxWeightKg = newMax;
      }

      if (name !== undefined) vehicle.name = name.trim();
      if (currentHubId !== undefined) vehicle.currentHubId = currentHubId;
      if (isActive !== undefined) vehicle.isActive = Boolean(isActive);

      await vehicle.save();

      emitRealTimeUpdate(req, 'fleet:updated', { action: 'vehicle_updated', vehicle });

      res.status(200).json({
        success: true,
        message: 'Vehicle updated successfully',
        data: vehicle
      });
    } catch (error) {
      console.error('Error updating campus vehicle:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update campus vehicle',
        error: error.message
      });
    }
  }

  /**
   * POST /api/nodes or /api/delivery/nodes
   * Admin / Mailroom: Add a new campus building with 3D coordinates & dimensions
   */
  async createCampusNode(req, res) {
    try {
      const {
        hubId,
        code,
        name,
        zone,
        mapPosition,
        dimensions,
        isPedestrianOnly = false,
        accessibleBy,
        isMailroom = false
      } = req.body;

      const nodeCode = (hubId || code || '').trim().toUpperCase();
      if (!nodeCode || !name || !zone || !mapPosition || mapPosition.x === undefined || mapPosition.y === undefined) {
        return res.status(400).json({
          success: false,
          message: 'hubId (or code), name, zone, and mapPosition with x and y are required'
        });
      }

      const allowedZones = ['ADMIN', 'ACADEMIC', 'HOSTEL', 'SPORTS', 'UTILITY'];
      if (!allowedZones.includes(zone)) {
        return res.status(400).json({
          success: false,
          message: `Invalid zone '${zone}'. Allowed: ${allowedZones.join(', ')}`
        });
      }

      const existing = await DeliveryHub.findOne({
        $or: [{ hubId: nodeCode }, { code: nodeCode }]
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Campus node '${nodeCode}' already exists`
        });
      }

      const resolvedAccessibleBy = accessibleBy && accessibleBy.length > 0
        ? accessibleBy
        : (isPedestrianOnly ? ['ECART', 'HAND_TROLLEY'] : ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY']);

      const node = new DeliveryHub({
        hubId: nodeCode,
        code: nodeCode,
        name: name.trim(),
        zone,
        mapPosition: {
          x: Number(mapPosition.x),
          y: Number(mapPosition.y),
          z: Number(mapPosition.z || 0)
        },
        dimensions: {
          width: Number(dimensions?.width || 80),
          depth: Number(dimensions?.depth || 60),
          height: Number(dimensions?.height || 35)
        },
        isPedestrianOnly: Boolean(isPedestrianOnly),
        accessibleBy: resolvedAccessibleBy,
        isMailroom: Boolean(isMailroom),
        isActive: true
      });

      await node.save();

      emitRealTimeUpdate(req, 'fleet:updated', { action: 'node_created', node });

      res.status(201).json({
        success: true,
        message: 'Campus node created successfully',
        data: node
      });
    } catch (error) {
      console.error('Error creating campus node:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create campus node',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/nodes/:id or /api/delivery/nodes/:id
   * Admin / Mailroom: Update building pedestrian access, active status, or 3D metadata
   */
  async updateCampusNode(req, res) {
    try {
      const { id } = req.params;
      const {
        name,
        zone,
        mapPosition,
        dimensions,
        isPedestrianOnly,
        accessibleBy,
        isMailroom,
        isActive
      } = req.body;

      const query = mongoose.isValidObjectId(id)
        ? { $or: [{ _id: id }, { hubId: id }, { code: id }] }
        : { $or: [{ hubId: id }, { code: id }] };

      const node = await DeliveryHub.findOne(query);
      if (!node) {
        return res.status(404).json({
          success: false,
          message: `Campus node '${id}' not found`
        });
      }

      if (name !== undefined) node.name = name.trim();
      if (zone !== undefined) {
        const allowedZones = ['ADMIN', 'ACADEMIC', 'HOSTEL', 'SPORTS', 'UTILITY'];
        if (!allowedZones.includes(zone)) {
          return res.status(400).json({
            success: false,
            message: `Invalid zone '${zone}'. Allowed: ${allowedZones.join(', ')}`
          });
        }
        node.zone = zone;
      }

      if (mapPosition) {
        if (mapPosition.x !== undefined) node.mapPosition.x = Number(mapPosition.x);
        if (mapPosition.y !== undefined) node.mapPosition.y = Number(mapPosition.y);
        if (mapPosition.z !== undefined) node.mapPosition.z = Number(mapPosition.z);
      }

      if (dimensions) {
        if (dimensions.width !== undefined) node.dimensions.width = Number(dimensions.width);
        if (dimensions.depth !== undefined) node.dimensions.depth = Number(dimensions.depth);
        if (dimensions.height !== undefined) node.dimensions.height = Number(dimensions.height);
      }

      if (isPedestrianOnly !== undefined) {
        node.isPedestrianOnly = Boolean(isPedestrianOnly);
        if (accessibleBy === undefined) {
          node.accessibleBy = node.isPedestrianOnly
            ? ['ECART', 'HAND_TROLLEY']
            : ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'];
        }
      }

      if (accessibleBy !== undefined) node.accessibleBy = accessibleBy;
      if (isMailroom !== undefined) node.isMailroom = Boolean(isMailroom);
      if (isActive !== undefined) node.isActive = Boolean(isActive);

      await node.save();

      emitRealTimeUpdate(req, 'fleet:updated', { action: 'node_updated', node });

      res.status(200).json({
        success: true,
        message: 'Campus node updated successfully',
        data: node
      });
    } catch (error) {
      console.error('Error updating campus node:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update campus node',
        error: error.message
      });
    }
  }
}

module.exports = new DeliveryController();
