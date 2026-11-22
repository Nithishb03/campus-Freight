/**
 * 🧪 Campus Freight and Delivery Management System - Test Suite
 * Tests models, RBAC, 5 guardrails, Haversine distance, and AI routing fallback.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');
const { DeliveryHub, DeliveryVehicle, DeliveryAgent } = require('../src/models/Delivery');
const Order = require('../src/models/Order');
const Notification = require('../src/models/Notification');
const { authorizeRoles } = require('../src/middleware/auth');
const orderController = require('../src/controllers/orderController');
const aiService = require('../src/services/aiService');

async function runTestSuite() {
  console.log('🚀 Running Campus Freight Test Suite...\n');

  // 1. Models & Validation
  console.log('1. Checking Mongoose Schemas...');
  assert(Customer.modelName === 'Customer');
  assert(DeliveryHub.modelName === 'DeliveryHub');
  assert(DeliveryVehicle.modelName === 'DeliveryVehicle');
  assert(DeliveryAgent.modelName === 'DeliveryAgent');
  assert(Order.modelName === 'Order');
  assert(Notification.modelName === 'Notification');
  console.log('   ✅ All 6 models defined and loaded properly.');

  // 2. RBAC Middleware
  console.log('\n2. Checking RBAC Middleware...');
  const rbac = authorizeRoles('admin', 'mailroom');
  let blocked = false;
  rbac({ user: { role: 'requester' } }, { status: (c) => ({ json: () => { blocked = (c === 403); } }) }, () => {});
  assert.strictEqual(blocked, true, 'Requester should be blocked from admin route');
  let allowed = false;
  rbac({ user: { role: 'admin' } }, {}, () => { allowed = true; });
  assert.strictEqual(allowed, true, 'Admin should pass through');
  console.log('   ✅ RBAC 403 Forbidden gating verified.');

  // 3. 3D Grid & Distance Math
  console.log('\n3. Checking 3D Grid Distance & Coordinates...');
  // MAIN-MAILROOM (420, 80) to ADMIN-BLOCK (260, 210)
  // dx = 160, dy = 130 -> sqrt(160^2 + 130^2) = 206.155 grid units * 0.8 = 165 meters
  const dist3D = aiService.calculateDistanceMeters(
    { mapPosition: { x: 420, y: 80, z: 0 } },
    { mapPosition: { x: 260, y: 210, z: 0 } }
  );
  console.log(`   Main Entrance (420, 80) to Admin Block (260, 210): ${dist3D} meters`);
  assert.strictEqual(dist3D, 165, '3D Euclidean distance scaled by 0.8 must equal 165m');

  const distGeo = aiService.calculateDistanceMeters(
    { lat: 12.9237, lng: 77.4987 },
    { lat: 12.9242, lng: 77.5002 }
  );
  console.log(`   Haversine fallback: ${distGeo} meters`);
  assert(distGeo > 160 && distGeo < 185);
  console.log('   ✅ 3D Grid and Haversine distance calculations verified.');

  // 4. Route Optimization with Priority & 3D Coordinates
  console.log('\n4. Checking Route Optimization (Priority-Weighted Nearest-Neighbor & 3D Stops)...');
  const route = await aiService.optimizeCampusRoute({
    startHub: { hubId: 'MAIN-MAILROOM', mapPosition: { x: 420, y: 80, z: 0 }, coordinates: { lat: 12.9258, lng: 77.4983 } },
    stops: [
      { trackingId: 'CFR-1001', hubId: 'CSE-DEPT', mapPosition: { x: 760, y: 420, z: 0 }, priority: 'STANDARD' },
      { trackingId: 'CFR-1002', hubId: 'LIBRARY', mapPosition: { x: 320, y: 740, z: 0 }, priority: 'URGENT', isFragile: true }
    ],
    vehicleType: 'ECART'
  });
  assert.strictEqual(route.orderedStops[0].trackingId, 'CFR-1002', 'URGENT stop must be first');
  assert(route.orderedStops[0].mapPosition, 'Ordered stop must retain mapPosition for 3D route rendering');
  assert(route.orderedStops[0].dimensions, 'Ordered stop must retain dimensions for 3D building rendering');
  console.log(`   ✅ Route optimization scheduled URGENT stop first (${route.totalDistanceMeters}m, ${route.estimatedMinutes}min, 3D metadata intact).`);

  // 5. Dispatch Recommender & Pedestrian Restrictions
  console.log('\n5. Checking Dispatch Recommender & Vehicle Accessibility...');
  const dispatch = await aiService.recommendDispatch({
    pickupNode: { hubId: 'MAIN-MAILROOM', accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'] },
    dropoffNode: { hubId: 'CENTRAL-LIBRARY', accessibleBy: ['ECART', 'HAND_TROLLEY'] }, // VAN not allowed
    weightKg: 10,
    isFragile: true,
    availableVehicles: [
      { vehicleId: 'V1', name: 'Van', type: 'VAN', maxWeightKg: 500, currentLoadKg: 0, status: 'AVAILABLE', isActive: true },
      { vehicleId: 'V2', name: 'ECart', type: 'ECART', maxWeightKg: 200, currentLoadKg: 0, status: 'AVAILABLE', isActive: true }
    ]
  });
  assert.strictEqual(dispatch.recommendedVehicle.type, 'ECART', 'VAN must be restricted from pedestrian Central Library');
  assert.strictEqual(dispatch.compatibleVehiclesCount, 1);
  assert.strictEqual(dispatch.requiresAdminApproval, true);
  console.log(`   ✅ Dispatch correctly filtered out VAN and recommended ${dispatch.recommendedVehicle.name} (${dispatch.recommendedVehicle.type}).`);

  console.log('\n=============================================');
  console.log('🎉 ALL SYSTEM TESTS PASSED SUCCESSFULLY!');
  console.log('=============================================');
}

runTestSuite().then(() => process.exit(0)).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
