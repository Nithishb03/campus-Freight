/**
 * 🧪 End-to-End Integration Test
 * Validates the complete campus freight lifecycle over real HTTP requests.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const axios = require('axios');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server');
const seedDatabase = require('./seedDatabase');
const { DeliveryVehicle } = require('../src/models/Delivery');

async function runE2ETest() {
  console.log('================================================================');
  console.log('🚀 CAMPUS FREIGHT END-TO-END INTEGRATION TEST');
  console.log('================================================================\n');

  let mongod = null;
  let server = null;

  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // 1. Setup in-memory MongoDB & Seed
    console.log('📦 Setting up isolated in-memory test database...');
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    await seedDatabase(uri, false);
    console.log('✅ Database seeded with 10 nodes, 6 vehicles, 5 users, and 2 drivers.\n');

    // 2. Start Express app on ephemeral port
    server = app.listen(0);
    const port = server.address().port;
    const baseURL = `http://localhost:${port}/api`;
    const http = axios.create({ baseURL, validateStatus: () => true });

    let facultyToken = '';
    let adminToken = '';
    let driverToken = '';
    let orderId = '';
    let trackingId = '';
    let realOtp = '';

    // -------------------------------------------------------------
    // Step 1: Login as faculty & create Fragile 15kg Order
    // -------------------------------------------------------------
    console.log('Step 1: Faculty Login & Fragile Order Creation');
    const loginFacRes = await http.post('/auth/login', {
      email: 'faculty@campus.edu',
      password: 'Password@123'
    });
    assert.strictEqual(loginFacRes.status, 200, 'Faculty login must return 200');
    facultyToken = loginFacRes.data.data.token;
    assert(facultyToken, 'Faculty token must be returned');

    const orderRes = await http.post(
      '/orders',
      {
        pickupNode: { hubId: 'MAIN-MAILROOM' },
        dropoffNode: {
          hubId: 'CENTRAL-LIBRARY',
          recipientName: 'Prof. Alan Turing',
          recipientPhone: '+91-9876543203'
        },
        cargoDetails: {
          itemCategory: 'LAB_EQUIPMENT',
          description: 'Digital Laser Interferometer',
          weightKg: 15,
          isFragile: true
        },
        priority: 'URGENT'
      },
      { headers: { Authorization: `Bearer ${facultyToken}` } }
    );

    assert.strictEqual(orderRes.status, 201, 'Order creation must return 201');
    const orderData = orderRes.data.data;
    orderId = orderData._id;
    trackingId = orderData.trackingId;
    realOtp = orderData.pod?.otp;

    assert.strictEqual(orderData.status, 'PENDING_APPROVAL', 'Fragile order must require approval');
    assert.strictEqual(orderData.cargoDetails.requiresAdminApproval, true);
    assert(realOtp && realOtp.length === 4, '4-digit PoD OTP must be generated');
    console.log(`  [PASS] Order ${trackingId} created in PENDING_APPROVAL status with OTP: ${realOtp}`);

    // -------------------------------------------------------------
    // Step 2: Login as Admin & Try assigning before approval
    // -------------------------------------------------------------
    console.log('\nStep 2: Admin Login & Pre-Approval Assignment Rejection');
    const loginAdminRes = await http.post('/auth/login', {
      email: 'admin@campus.edu',
      password: 'Password@123'
    });
    assert.strictEqual(loginAdminRes.status, 200, 'Admin login must return 200');
    adminToken = loginAdminRes.data.data.token;

    const preApproveAssignRes = await http.put(
      `/orders/${orderId}/assign`,
      { driverId: 'AGT-001', vehicleId: 'VEH-VAN-01' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(preApproveAssignRes.status, 400, 'Assigning unapproved order must return 400');
    assert(preApproveAssignRes.data.message.includes('pending approval'));
    console.log('  [PASS] Rejected unapproved order assignment with 400 Bad Request.');

    // -------------------------------------------------------------
    // Step 3: Approve the Order
    // -------------------------------------------------------------
    console.log('\nStep 3: Approve Order (Admin)');
    const approveRes = await http.put(
      `/orders/${orderId}/approve`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(approveRes.status, 200, 'Approval must return 200');
    assert.strictEqual(approveRes.data.data.status, 'PENDING');
    console.log('  [PASS] Order approved and status updated to PENDING.');

    // -------------------------------------------------------------
    // Step 4: Try Assigning VAN to CENTRAL-LIBRARY (Pedestrian Restricted)
    // -------------------------------------------------------------
    console.log('\nStep 4: Pedestrian Zone Vehicle Restriction Guardrail');
    const vanAssignRes = await http.put(
      `/orders/${orderId}/assign`,
      { driverId: 'AGT-001', vehicleId: 'VEH-VAN-01' }, // VAN not in CENTRAL-LIBRARY accessibleBy
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(vanAssignRes.status, 400, 'Restricted vehicle must return 400');
    assert(vanAssignRes.data.message.includes('restricted'), 'Error message must note vehicle restriction');
    console.log(`  [PASS] Successfully blocked VAN from Central Library (${vanAssignRes.data.message}).`);

    // -------------------------------------------------------------
    // Step 5: Assign VEH-ECART-01 + Driver 1 (Atomic Load Check)
    // -------------------------------------------------------------
    console.log('\nStep 5: Assign Compatible Fleet (ECART + Driver 1)');
    const ecartBefore = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-01' });
    const loadBefore = ecartBefore.currentLoadKg;

    const ecartAssignRes = await http.put(
      `/orders/${orderId}/assign`,
      { driverId: 'AGT-001', vehicleId: 'VEH-ECART-01' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(ecartAssignRes.status, 200, 'Valid assignment must return 200');
    assert.strictEqual(ecartAssignRes.data.data.status, 'ASSIGNED');

    const ecartAfter = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-01' });
    assert.strictEqual(ecartAfter.currentLoadKg, loadBefore + 15, 'Vehicle load must atomically increment by 15kg');
    console.log(`  [PASS] Order assigned. VEH-ECART-01 load incremented: ${loadBefore}kg -> ${ecartAfter.currentLoadKg}kg.`);

    // -------------------------------------------------------------
    // Step 6: Login as Driver 1 & Call AI Route Optimization
    // -------------------------------------------------------------
    console.log('\nStep 6: Driver 1 Route Optimization');
    const loginDriverRes = await http.post('/auth/login', {
      email: 'driver1@campus.edu',
      password: 'Password@123'
    });
    assert.strictEqual(loginDriverRes.status, 200);
    driverToken = loginDriverRes.data.data.token;

    const routeRes = await http.post(
      '/ai/optimize-route',
      { startHubId: 'MAIN-MAILROOM' },
      { headers: { Authorization: `Bearer ${driverToken}` } }
    );
    assert.strictEqual(routeRes.status, 200, 'AI Route optimization must return 200');
    const routeData = routeRes.data.data;
    assert(routeData.orderedStops.length > 0, 'Must contain assigned stops');
    assert(routeData.totalDistanceMeters > 0, 'Must compute total distance');
    console.log(`  [PASS] Route optimized: ${routeData.totalDistanceMeters}m via ${routeData.vehicleType} (${routeData.estimatedMinutes} mins).`);

    // -------------------------------------------------------------
    // Step 7: Try Marking DELIVERED with Wrong OTP
    // -------------------------------------------------------------
    console.log('\nStep 7: Delivery Completion with Wrong OTP (Tamper Guardrail)');
    const wrongOtpRes = await http.put(
      `/orders/${orderId}/status`,
      { status: 'DELIVERED', otp: '0000' },
      { headers: { Authorization: `Bearer ${driverToken}` } }
    );
    assert.strictEqual(wrongOtpRes.status, 400, 'Invalid OTP must return 400');
    assert(wrongOtpRes.data.message.includes('Invalid Proof of Delivery OTP'));
    console.log('  [PASS] Delivery correctly rejected with 400 for invalid OTP.');

    // -------------------------------------------------------------
    // Step 8: Complete Delivery with Real OTP (Atomic Load Release)
    // -------------------------------------------------------------
    console.log('\nStep 8: Complete Delivery with Real OTP & Atomic Load Release');
    const correctOtpRes = await http.put(
      `/orders/${orderId}/status`,
      {
        status: 'DELIVERED',
        otp: realOtp,
        deliveryNotes: 'Handed to Prof. Turing at Library'
      },
      { headers: { Authorization: `Bearer ${driverToken}` } }
    );
    assert.strictEqual(correctOtpRes.status, 200, 'Valid delivery must return 200');
    assert.strictEqual(correctOtpRes.data.data.status, 'DELIVERED');
    assert.strictEqual(correctOtpRes.data.data.pod.isVerified, true);

    const ecartFinal = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-01' });
    assert.strictEqual(ecartFinal.currentLoadKg, loadBefore, 'Vehicle load must drop back to pre-assignment load');
    console.log(`  [PASS] Handover confirmed! PoD verified: true. Vehicle load released back to ${ecartFinal.currentLoadKg}kg.`);

    // -------------------------------------------------------------
    // Step 9: State Machine Invalid Jump Guard (Strict Transitions)
    // -------------------------------------------------------------
    console.log('\nStep 9: State Machine Invalid Jump Guard');
    // Create a 5kg standard order (status: PENDING)
    const stdOrderRes = await http.post(
      '/orders',
      {
        pickupNode: { hubId: 'MAIN-MAILROOM' },
        dropoffNode: {
          hubId: 'CSE-DEPT',
          recipientName: 'Lab Tech',
          recipientPhone: '+91-9876543209'
        },
        cargoDetails: {
          itemCategory: 'DOCUMENTS',
          description: 'Exam Papers',
          weightKg: 5,
          isFragile: false
        },
        priority: 'STANDARD'
      },
      { headers: { Authorization: `Bearer ${facultyToken}` } }
    );
    assert.strictEqual(stdOrderRes.status, 201);
    const stdOrderId = stdOrderRes.data.data._id;
    assert.strictEqual(stdOrderRes.data.data.status, 'PENDING');

    // Attempt invalid jump: PENDING -> DELIVERED
    const invalidJumpRes = await http.put(
      `/orders/${stdOrderId}/status`,
      { status: 'DELIVERED', otp: stdOrderRes.data.data.pod.otp },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(invalidJumpRes.status, 400, 'Invalid transition must return HTTP 400');
    assert(invalidJumpRes.data.message.includes('Invalid status transition'));
    console.log('  [PASS] Invalid status jump from PENDING to DELIVERED strictly rejected with HTTP 400.');

    // -------------------------------------------------------------
    // Step 10: Order Cancellation & Safe Load Floor Guard
    // -------------------------------------------------------------
    console.log('\nStep 10: Order Cancellation & Safe Load Floor Guard');
    // Assign stdOrder to VEH-ECART-01
    const assignStdRes = await http.put(
      `/orders/${stdOrderId}/assign`,
      { driverId: 'AGT-001', vehicleId: 'VEH-ECART-01' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(assignStdRes.status, 200);

    const ecartLoaded = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-01' });
    assert.strictEqual(ecartLoaded.currentLoadKg, 5, 'ECart load must reflect assigned 5kg order');

    // Faculty cancels the order before pickup
    const cancelRes = await http.put(
      `/orders/${stdOrderId}/cancel`,
      { reason: 'User cancelled delivery request' },
      { headers: { Authorization: `Bearer ${facultyToken}` } }
    );
    assert.strictEqual(cancelRes.status, 200, 'Cancellation before pickup must return 200');
    assert.strictEqual(cancelRes.data.data.status, 'CANCELLED');

    // Verify vehicle payload rolled back and floor guard holds (>= 0)
    const ecartAfterCancel = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-01' });
    assert.strictEqual(ecartAfterCancel.currentLoadKg, 0, 'ECart load must safely rollback to 0kg');
    assert(ecartAfterCancel.currentLoadKg >= 0, 'Vehicle load must never fall below 0');

    // Attempt cancelling already cancelled order
    const repeatCancelRes = await http.put(
      `/orders/${stdOrderId}/cancel`,
      { reason: 'Repeat cancel' },
      { headers: { Authorization: `Bearer ${facultyToken}` } }
    );
    assert.strictEqual(repeatCancelRes.status, 400, 'Repeat cancellation must return 400');
    console.log('  [PASS] Order cancellation succeeded, payload rolled back to 0kg with safe floor guard.');

    // -------------------------------------------------------------
    // Step 11: Driver & Vehicle Reassignment
    // -------------------------------------------------------------
    console.log('\nStep 11: Driver & Vehicle Reassignment (Atomic Load Transfer)');
    // Create another 10kg order
    const reassignOrderRes = await http.post(
      '/orders',
      {
        pickupNode: { hubId: 'MAIN-MAILROOM' },
        dropoffNode: {
          hubId: 'CSE-DEPT',
          recipientName: 'Prof. Turing',
          recipientPhone: '+91-9876543203'
        },
        cargoDetails: {
          itemCategory: 'LAB_EQUIPMENT',
          description: 'Oscilloscope',
          weightKg: 10,
          isFragile: false
        },
        priority: 'STANDARD'
      },
      { headers: { Authorization: `Bearer ${facultyToken}` } }
    );
    assert.strictEqual(reassignOrderRes.status, 201);
    const reassignOrderId = reassignOrderRes.data.data._id;

    // Initial assignment to Driver 1 (AGT-001) & VEH-ECART-01
    await http.put(
      `/orders/${reassignOrderId}/assign`,
      { driverId: 'AGT-001', vehicleId: 'VEH-ECART-01' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    const v1Before = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-01' });
    const v2Before = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-02' });
    assert.strictEqual(v1Before.currentLoadKg, 10);
    assert.strictEqual(v2Before.currentLoadKg, 0);

    // Admin reassigns to Driver 2 (AGT-002) & VEH-ECART-02
    const reassignRes = await http.put(
      `/orders/${reassignOrderId}/reassign`,
      {
        driverId: 'AGT-002',
        vehicleId: 'VEH-ECART-02',
        reason: 'Shift handover to Driver 2'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(reassignRes.status, 200, 'Reassignment must return 200');
    assert.strictEqual(reassignRes.data.data.status, 'ASSIGNED');
    assert(reassignRes.data.data.assignment?.driverId, 'Assignment must contain driverId');
    assert(reassignRes.data.data.assignment?.vehicleId, 'Assignment must contain vehicleId');

    const v1After = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-01' });
    const v2After = await DeliveryVehicle.findOne({ vehicleId: 'VEH-ECART-02' });
    assert.strictEqual(v1After.currentLoadKg, 0, 'Original vehicle load must be released back to 0kg');
    assert.strictEqual(v2After.currentLoadKg, 10, 'New vehicle load must be atomically incremented to 10kg');
    console.log(`  [PASS] Order successfully reassigned! Load released from VEH-ECART-01 (${v1After.currentLoadKg}kg) and transferred to VEH-ECART-02 (${v2After.currentLoadKg}kg).`);

    // -------------------------------------------------------------
    // Step 12: Admin Fleet/Node Management CRUD & Maintenance Guardrail
    // -------------------------------------------------------------
    console.log('\nStep 12: Admin Fleet/Node CRUD & Maintenance Guardrail');
    // Attempt setting VEH-ECART-02 (currently has 10kg active cargo) to MAINTENANCE
    const blockedMaintRes = await http.put(
      '/vehicles/VEH-ECART-02',
      { status: 'MAINTENANCE' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(blockedMaintRes.status, 400, 'Cannot set active vehicle to MAINTENANCE');
    assert(blockedMaintRes.data.message.includes('MAINTENANCE') && blockedMaintRes.data.message.includes('active'));
    console.log('  [PASS] Correctly blocked setting vehicle with active orders to MAINTENANCE (400 Bad Request).');

    // Admin registers a new vehicle
    const newVehicleRes = await http.post(
      '/vehicles',
      {
        name: 'Solar Eco-Cart 1',
        type: 'ECART',
        registrationNumber: 'KA-01-SC-901',
        maxWeightKg: 150
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(newVehicleRes.status, 201, 'Vehicle creation must return 201');
    const newVehId = newVehicleRes.data.data.vehicleId;
    assert(newVehId.startsWith('VEH-ECART-'));

    // Update empty vehicle to MAINTENANCE
    const setMaintRes = await http.put(
      `/vehicles/${newVehId}`,
      { status: 'MAINTENANCE', maxWeightKg: 180 },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(setMaintRes.status, 200);
    assert.strictEqual(setMaintRes.data.data.status, 'MAINTENANCE');
    assert.strictEqual(setMaintRes.data.data.maxWeightKg, 180);
    console.log('  [PASS] Admin vehicle registration and MAINTENANCE toggle verified.');

    // Admin creates a new Campus Node
    const newNodeRes = await http.post(
      '/nodes',
      {
        hubId: 'INNOVATION-HUB',
        name: 'Innovation Hub & Makerspace',
        zone: 'ACADEMIC',
        mapPosition: { x: 500, y: 500, z: 0 },
        dimensions: { width: 90, depth: 70, height: 40 },
        isPedestrianOnly: true
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(newNodeRes.status, 201);
    assert.strictEqual(newNodeRes.data.data.isPedestrianOnly, true);
    assert(newNodeRes.data.data.accessibleBy.includes('ECART') && !newNodeRes.data.data.accessibleBy.includes('VAN'));

    // Admin toggles pedestrian status
    const updateNodeRes = await http.put(
      '/nodes/INNOVATION-HUB',
      { isPedestrianOnly: false },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(updateNodeRes.status, 200);
    assert.strictEqual(updateNodeRes.data.data.isPedestrianOnly, false);
    assert(updateNodeRes.data.data.accessibleBy.includes('VAN'));
    console.log('  [PASS] Admin 3D campus node creation and pedestrian permission toggle verified.');

    // -------------------------------------------------------------
    // Step 13: Advanced Analytics Aggregation Pipeline
    // -------------------------------------------------------------
    console.log('\nStep 13: Advanced Analytics Aggregation Pipeline');
    const analyticsRes = await http.get('/orders/analytics/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(analyticsRes.status, 200);
    const analytics = analyticsRes.data.data;

    assert(Array.isArray(analytics.ordersByStatus), 'ordersByStatus must be an array for chart visualization');
    assert(Array.isArray(analytics.busiestHubs), 'busiestHubs must be an array of top campus hubs');
    assert(analytics.busiestHubs.length > 0, 'busiestHubs must contain entries');
    assert(analytics.busiestHubs[0].hubId && analytics.busiestHubs[0].totalTrips !== undefined);

    assert(Array.isArray(analytics.fleetUtilizationByType), 'fleetUtilizationByType must be an array');
    assert.strictEqual(analytics.fleetUtilizationByType.length, 4, 'Must aggregate all 4 vehicle classes');

    assert(analytics.greenLogistics, 'greenLogistics object must be present');
    assert(analytics.greenLogistics.greenTripPct !== undefined, 'greenTripPct metric must be computed');
    assert(analytics.greenLogistics.co2SavedKg !== undefined, 'co2SavedKg must be computed');
    console.log(`  [PASS] Analytics summary verified: ${analytics.busiestHubs.length} busiest hubs, ${analytics.greenLogistics.greenTripPct}% zero-emission trips, ${analytics.greenLogistics.co2SavedKg}kg CO2 saved.`);

    console.log('\n================================================================');
    console.log('🎉 ALL 13 LIFECYCLE, HARDENING & CRUD STEPS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongod) await mongod.stop();
  }
}

runE2ETest().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
