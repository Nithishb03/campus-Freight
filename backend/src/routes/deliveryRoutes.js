const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All delivery endpoints require authentication
router.use(protect);

// 1. Campus Nodes (Authenticated)
router.get('/nodes', (req, res) => deliveryController.getCampusNodes(req, res));
router.get('/nodes/:hubId', (req, res) => deliveryController.getCampusNodeById(req, res));
router.post(
  '/nodes',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => deliveryController.createCampusNode(req, res)
);
router.put(
  '/nodes/:id',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => deliveryController.updateCampusNode(req, res)
);

// 2. Campus Vehicles (Authenticated)
router.get('/vehicles', (req, res) => deliveryController.getCampusVehicles(req, res));
router.post(
  '/vehicles',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => deliveryController.createCampusVehicle(req, res)
);
router.put(
  '/vehicles/:id',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => deliveryController.updateCampusVehicle(req, res)
);

// 3. Campus Drivers (Admin / Mailroom only)
router.get(
  '/drivers',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => deliveryController.getDeliveryDrivers(req, res)
);

// 4. Driver Location Update (Driver / Admin only)
router.put(
  '/drivers/:agentId/location',
  authorizeRoles('driver', 'admin'),
  (req, res) => deliveryController.updateDriverLocation(req, res)
);

module.exports = router;
