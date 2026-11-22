const express = require('express');
const router = express.Router();

/**
 * Campus Freight Management System - Interactive API Documentation
 */
router.get('/', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;

  res.status(200).json({
    title: 'Campus Freight and Delivery Management System API',
    version: '3.0.0',
    description: 'Autonomous and managed campus freight operations, building accessibility routing, and load-balanced delivery fleet management.',
    baseUrl: `${host}/api`,
    endpoints: {
      auth: {
        register: {
          method: 'POST',
          path: '/api/auth/register',
          roles: ['Public'],
          description: 'Register a new campus user (requester, driver, mailroom, admin)'
        },
        login: {
          method: 'POST',
          path: '/api/auth/login',
          roles: ['Public'],
          description: 'Login with campus credentials and receive JWT bearer token'
        },
        getMe: {
          method: 'GET',
          path: '/api/auth/me',
          roles: ['Authenticated'],
          description: 'Retrieve current authenticated user profile'
        }
      },
      delivery: {
        nodes: {
          method: 'GET',
          path: '/api/delivery/nodes',
          roles: ['Authenticated'],
          description: 'List all active campus hubs/buildings with accessibility vehicle rules'
        },
        vehicles: {
          method: 'GET',
          path: '/api/delivery/vehicles',
          roles: ['Authenticated'],
          description: 'List campus fleet vehicles, weight capacities, and current loads'
        },
        drivers: {
          method: 'GET',
          path: '/api/delivery/drivers',
          roles: ['admin', 'mailroom'],
          description: 'List active delivery agents, current zones, and assigned orders'
        },
        driverLocation: {
          method: 'PUT',
          path: '/api/delivery/drivers/:agentId/location',
          roles: ['driver', 'admin'],
          description: 'Update real-time GPS location for driver'
        }
      },
      orders: {
        create: {
          method: 'POST',
          path: '/api/orders',
          roles: ['requester', 'mailroom', 'admin'],
          description: 'Create freight request with automatic fragile/heavy approval gating'
        },
        list: {
          method: 'GET',
          path: '/api/orders',
          roles: ['Authenticated (Scoped by role)'],
          description: 'List orders (filtered by role and query status)'
        },
        analyticsSummary: {
          method: 'GET',
          path: '/api/orders/analytics/summary',
          roles: ['admin', 'mailroom'],
          description: 'Get counts by status, total active cargo weight, and fleet utilization'
        },
        getSingle: {
          method: 'GET',
          path: '/api/orders/:id',
          roles: ['Authenticated'],
          description: 'Get single order details by MongoDB _id or trackingId'
        },
        approve: {
          method: 'PUT',
          path: '/api/orders/:id/approve',
          roles: ['admin', 'mailroom'],
          description: 'Approve fragile or heavy cargo orders'
        },
        assign: {
          method: 'PUT',
          path: '/api/orders/:id/assign',
          roles: ['admin', 'mailroom'],
          description: 'Assign driver and vehicle with accessibility & capacity guardrails'
        },
        updateStatus: {
          method: 'PUT',
          path: '/api/orders/:id/status',
          roles: ['driver', 'admin', 'mailroom'],
          description: 'Update lifecycle status, verify OTP for POD, or record failed delivery'
        }
      },
      system: {
        health: {
          method: 'GET',
          path: '/health',
          roles: ['Public'],
          description: 'Service health check'
        }
      }
    }
  });
});

module.exports = router;
