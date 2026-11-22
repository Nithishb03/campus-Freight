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

    console.log('\n================================================================');
    console.log('🎉 ALL 8 LIFECYCLE STEPS PASSED WITH 100% SUCCESS!');
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
