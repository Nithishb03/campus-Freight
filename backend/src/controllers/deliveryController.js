const { DeliveryHub, DeliveryVehicle, DeliveryAgent } = require('../models/Delivery');
const mongoose = require('mongoose');

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
}

module.exports = new DeliveryController();
