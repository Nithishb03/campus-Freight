const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All order routes require authentication
router.use(protect);

// 1. Create Order (requester, mailroom, admin)
router.post(
  '/',
  authorizeRoles('requester', 'mailroom', 'admin'),
  (req, res) => orderController.createOrder(req, res)
);

// 2. List Orders (scoped by role inside controller)
router.get('/', (req, res) => orderController.getOrders(req, res));

// 3. Analytics Summary (admin, mailroom) - defined before /:id to prevent route collision
router.get(
  '/analytics/summary',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => orderController.getOrderAnalyticsSummary(req, res)
);

// 4. Single Order Details
router.get('/:id', (req, res) => orderController.getOrderById(req, res));

// 5. Approve Order (admin, mailroom)
router.put(
  '/:id/approve',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => orderController.approveOrder(req, res)
);

// 6. Assign Driver & Vehicle (admin, mailroom)
router.put(
  '/:id/assign',
  authorizeRoles('admin', 'mailroom'),
  (req, res) => orderController.assignOrder(req, res)
);

// 7. Update Status & POD verification (driver, admin, mailroom)
router.put(
  '/:id/status',
  authorizeRoles('driver', 'admin', 'mailroom'),
  (req, res) => orderController.updateOrderStatus(req, res)
);

module.exports = router;
