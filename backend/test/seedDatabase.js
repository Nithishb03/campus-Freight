/**
 * 🌱 Campus Freight and Delivery Management System - Database Seeder
 * Seeds the database with campus hubs, vehicles, default users, and delivery agents.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Customer = require('../src/models/Customer');
const { DeliveryHub, DeliveryAgent, DeliveryVehicle } = require('../src/models/Delivery');
const Order = require('../src/models/Order');
const Notification = require('../src/models/Notification');

// 16 Real Campus Buildings & Landmarks mapped to 3D Coordinates (1000x1000 Grid)
const CAMPUS_HUBS = [
  {
    code: 'MAIN-MAILROOM',
    hubId: 'MAIN-MAILROOM',
    name: 'Main Entrance & Mailroom',
    zone: 'ADMIN',
    mapPosition: { x: 420, y: 80, z: 0 },
    dimensions: { width: 90, depth: 45, height: 25 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: true,
    coordinates: { lat: 12.9258, lng: 77.4983 },
    isActive: true
  },
  {
    code: 'ADMIN-BLOCK',
    hubId: 'ADMIN-BLOCK',
    name: 'Admin Block',
    zone: 'ADMIN',
    mapPosition: { x: 260, y: 210, z: 0 },
    dimensions: { width: 140, depth: 100, height: 55 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.92515, lng: 77.4975 },
    isActive: true
  },
  {
    code: 'CIVIL-DEPT',
    hubId: 'CIVIL-DEPT',
    name: 'Civil Engineering Dept',
    zone: 'ACADEMIC',
    mapPosition: { x: 480, y: 220, z: 0 },
    dimensions: { width: 95, depth: 90, height: 45 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9251, lng: 77.4986 },
    isActive: true
  },
  {
    code: 'SPORTS-GROUND',
    hubId: 'SPORTS-GROUND',
    name: 'Football & Cricket Ground',
    zone: 'SPORTS',
    mapPosition: { x: 740, y: 210, z: 0 },
    dimensions: { width: 220, depth: 180, height: 4 },
    isPedestrianOnly: true,
    accessibleBy: ['ECART', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.92515, lng: 77.4999 },
    isActive: true
  },
  {
    code: 'MECH-DEPT',
    hubId: 'MECH-DEPT',
    name: 'Mechanical Dept & Design Huddle',
    zone: 'ACADEMIC',
    mapPosition: { x: 90, y: 220, z: 0 },
    dimensions: { width: 90, depth: 130, height: 40 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9251, lng: 77.49665 },
    aliases: ['MECH-WORKSHOP'],
    isActive: true
  },
  {
    code: 'BIOTECH-QUAD',
    hubId: 'BIOTECH-QUAD',
    name: 'Biotech Quadrangle',
    zone: 'ACADEMIC',
    mapPosition: { x: 90, y: 420, z: 0 },
    dimensions: { width: 95, depth: 95, height: 20 },
    isPedestrianOnly: true,
    accessibleBy: ['ECART', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9241, lng: 77.49665 },
    isActive: true
  },
  {
    code: 'EEE-DEPT',
    hubId: 'EEE-DEPT',
    name: 'EEE Department',
    zone: 'ACADEMIC',
    mapPosition: { x: 480, y: 380, z: 0 },
    dimensions: { width: 95, depth: 75, height: 45 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9243, lng: 77.4986 },
    isActive: true
  },
  {
    code: 'ECE-DEPT',
    hubId: 'ECE-DEPT',
    name: 'ECE Department',
    zone: 'ACADEMIC',
    mapPosition: { x: 480, y: 480, z: 0 },
    dimensions: { width: 95, depth: 75, height: 45 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9238, lng: 77.4986 },
    isActive: true
  },
  {
    code: 'CSE-DEPT',
    hubId: 'CSE-DEPT',
    name: 'CSE Department',
    zone: 'ACADEMIC',
    mapPosition: { x: 760, y: 420, z: 0 },
    dimensions: { width: 130, depth: 60, height: 50 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9241, lng: 77.500 },
    aliases: ['CSE-BLOCK'],
    isActive: true
  },
  {
    code: 'HEALTH-CENTRE',
    hubId: 'HEALTH-CENTRE',
    name: 'Health Centre & Temple',
    zone: 'UTILITY',
    mapPosition: { x: 760, y: 500, z: 0 },
    dimensions: { width: 120, depth: 50, height: 25 },
    isPedestrianOnly: true,
    accessibleBy: ['ECART', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9237, lng: 77.500 },
    isActive: true
  },
  {
    code: 'KRISHNA-HOSTEL',
    hubId: 'KRISHNA-HOSTEL',
    name: 'Krishna Hostel',
    zone: 'HOSTEL',
    mapPosition: { x: 760, y: 600, z: 0 },
    dimensions: { width: 130, depth: 80, height: 65 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9232, lng: 77.500 },
    aliases: ['BOYS-HOSTEL-A'],
    isActive: true
  },
  {
    code: 'CAUVERY-HOSTEL',
    hubId: 'CAUVERY-HOSTEL',
    name: 'Cauvery Boys Hostel',
    zone: 'HOSTEL',
    mapPosition: { x: 760, y: 740, z: 0 },
    dimensions: { width: 130, depth: 95, height: 65 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9225, lng: 77.500 },
    aliases: ['GIRLS-HOSTEL-B'],
    isActive: true
  },
  {
    code: 'MATH-DEPT',
    hubId: 'MATH-DEPT',
    name: 'Mathematics Dept',
    zone: 'ACADEMIC',
    mapPosition: { x: 760, y: 880, z: 0 },
    dimensions: { width: 130, depth: 75, height: 40 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9218, lng: 77.500 },
    isActive: true
  },
  {
    code: 'CHEM-PHYSICS',
    hubId: 'CHEM-PHYSICS',
    name: 'Chem Engg & Physics Dept',
    zone: 'ACADEMIC',
    mapPosition: { x: 260, y: 600, z: 0 },
    dimensions: { width: 110, depth: 85, height: 40 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9232, lng: 77.4975 },
    aliases: ['SCIENCE-LABS'],
    isActive: true
  },
  {
    code: 'LIBRARY',
    hubId: 'LIBRARY',
    name: 'Central Library',
    zone: 'ACADEMIC',
    mapPosition: { x: 320, y: 740, z: 0 },
    dimensions: { width: 140, depth: 85, height: 55 },
    isPedestrianOnly: true,
    accessibleBy: ['ECART', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9225, lng: 77.4978 },
    aliases: ['CENTRAL-LIBRARY'],
    isActive: true
  },
  {
    code: 'ISE-AERO',
    hubId: 'ISE-AERO',
    name: 'ISE & Aerospace Dept',
    zone: 'ACADEMIC',
    mapPosition: { x: 320, y: 880, z: 0 },
    dimensions: { width: 140, depth: 80, height: 45 },
    isPedestrianOnly: false,
    accessibleBy: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    isMailroom: false,
    coordinates: { lat: 12.9218, lng: 77.4978 },
    isActive: true
  }
];

const CAMPUS_VEHICLES = [
  {
    vehicleId: 'VEH-VAN-01',
    name: 'Campus Utility Van',
    type: 'VAN',
    registrationNumber: 'KA-01-CP-001',
    maxWeightKg: 500,
    currentLoadKg: 0,
    status: 'AVAILABLE',
    currentHubId: 'MAIN-MAILROOM',
    assignedOrders: [],
    isActive: true
  },
  {
    vehicleId: 'VEH-ECART-01',
    name: 'Electric Cargo Cart 1',
    type: 'ECART',
    registrationNumber: 'KA-01-EC-101',
    maxWeightKg: 200,
    currentLoadKg: 0,
    status: 'AVAILABLE',
    currentHubId: 'MAIN-MAILROOM',
    assignedOrders: [],
    isActive: true
  },
  {
    vehicleId: 'VEH-ECART-02',
    name: 'Electric Cargo Cart 2',
    type: 'ECART',
    registrationNumber: 'KA-01-EC-102',
    maxWeightKg: 200,
    currentLoadKg: 0,
    status: 'AVAILABLE',
    currentHubId: 'MAIN-MAILROOM',
    assignedOrders: [],
    isActive: true
  },
  {
    vehicleId: 'VEH-BIKE-01',
    name: 'Cargo Bike 1',
    type: 'CARGO_BIKE',
    registrationNumber: 'KA-01-CB-201',
    maxWeightKg: 40,
    currentLoadKg: 0,
    status: 'AVAILABLE',
    currentHubId: 'MAIN-MAILROOM',
    assignedOrders: [],
    isActive: true
  },
  {
    vehicleId: 'VEH-BIKE-02',
    name: 'Cargo Bike 2',
    type: 'CARGO_BIKE',
    registrationNumber: 'KA-01-CB-202',
    maxWeightKg: 40,
    currentLoadKg: 0,
    status: 'AVAILABLE',
    currentHubId: 'MAIN-MAILROOM',
    assignedOrders: [],
    isActive: true
  },
  {
    vehicleId: 'VEH-TROLLEY-01',
    name: 'Heavy Hand Trolley 1',
    type: 'HAND_TROLLEY',
    registrationNumber: 'KA-01-HT-301',
    maxWeightKg: 80,
    currentLoadKg: 0,
    status: 'AVAILABLE',
    currentHubId: 'MAIN-MAILROOM',
    assignedOrders: [],
    isActive: true
  }
];

let seedMongoMemoryServer = null;

async function seedDatabase(customUri = null, shouldDisconnect = true) {
  const isAlreadyConnected = mongoose.connection.readyState === 1;
  const mongoUri = customUri || process.env.MONGO_URI || 'mongodb://localhost:27017/campus_freight_db';

  try {
    if (!isAlreadyConnected) {
      try {
        console.log('Connecting to MongoDB at:', mongoUri);
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
        console.log('Connected to MongoDB successfully.');
      } catch (connErr) {
        const isConnRefused =
          connErr.message?.includes('ECONNREFUSED') ||
          connErr.name === 'MongooseServerSelectionError';

        if (isConnRefused) {
          console.log('⚠️  Standard MongoDB unreachable. Starting In-Memory Mongo instance for seeding...');
          const { MongoMemoryServer } = require('mongodb-memory-server');
          seedMongoMemoryServer = await MongoMemoryServer.create();
          const memUri = seedMongoMemoryServer.getUri();
          await mongoose.connect(memUri);
          console.log(`⚡ Connected to In-Memory MongoDB (${memUri})`);
        } else {
          throw connErr;
        }
      }
    }

    // Clear existing campus collections
    console.log('Clearing existing database collections...');
    await Promise.all([
      DeliveryHub.deleteMany({}),
      DeliveryVehicle.deleteMany({}),
      Customer.deleteMany({}),
      DeliveryAgent.deleteMany({}),
      Order.deleteMany({}),
      Notification.deleteMany({})
    ]);
    console.log('Collections cleared.');

    // 1. Seed Campus Nodes (DeliveryHub)
    console.log(`Seeding ${CAMPUS_HUBS.length} Campus Nodes...`);
    const seededHubs = await DeliveryHub.insertMany(CAMPUS_HUBS);
    console.log(`Seeded ${seededHubs.length} Campus Nodes successfully.`);

    // 2. Seed Campus Fleet (DeliveryVehicle)
    console.log(`Seeding ${CAMPUS_VEHICLES.length} Campus Vehicles...`);
    const seededVehicles = await DeliveryVehicle.insertMany(CAMPUS_VEHICLES);
    console.log(`Seeded ${seededVehicles.length} Campus Vehicles successfully.`);

    // 3. Seed Default Users (Customer)
    console.log('Seeding 5 Default Campus Users with password "Password@123"...');
    const hashedPassword = await bcrypt.hash('Password@123', 10);

    const defaultUsers = [
      {
        name: 'Campus Administrator',
        username: 'admin',
        email: 'admin@campus.edu',
        phone: '+91-9876543201',
        password: hashedPassword,
        role: 'admin',
        campusId: 'ADMIN-001',
        department: 'Administration',
        defaultCampusNode: 'ADMIN-BLOCK',
        isActive: true
      },
      {
        name: 'Central Mailroom Staff',
        username: 'mailroom',
        email: 'mailroom@campus.edu',
        phone: '+91-9876543202',
        password: hashedPassword,
        role: 'mailroom',
        campusId: 'STAFF-MR-01',
        department: 'Mail & Logistics',
        defaultCampusNode: 'MAIN-MAILROOM',
        isActive: true
      },
      {
        name: 'Prof. Alan Turing',
        username: 'faculty',
        email: 'faculty@campus.edu',
        phone: '+91-9876543203',
        password: hashedPassword,
        role: 'requester',
        campusId: 'FAC-CSE-01',
        department: 'Computer Science & Engineering',
        defaultCampusNode: 'CSE-DEPT',
        isActive: true
      },
      {
        name: 'Ramesh Kumar',
        username: 'driver1',
        email: 'driver1@campus.edu',
        phone: '+91-9876543204',
        password: hashedPassword,
        role: 'driver',
        campusId: 'DRV-001',
        department: 'Campus Logistics Fleet',
        defaultCampusNode: 'MAIN-MAILROOM',
        isActive: true
      },
      {
        name: 'Suresh Patel',
        username: 'driver2',
        email: 'driver2@campus.edu',
        phone: '+91-9876543205',
        password: hashedPassword,
        role: 'driver',
        campusId: 'DRV-002',
        department: 'Campus Logistics Fleet',
        defaultCampusNode: 'MAIN-MAILROOM',
        isActive: true
      }
    ];

    const seededUsers = await Customer.insertMany(defaultUsers);
    console.log(`Seeded ${seededUsers.length} Users successfully.`);

    const driver1User = seededUsers.find(u => u.username === 'driver1');
    const driver2User = seededUsers.find(u => u.username === 'driver2');

    // 4. Seed Delivery Agents (DeliveryAgent)
    console.log('Seeding 2 Delivery Agents linked to drivers...');
    const deliveryAgents = [
      {
        agentId: 'AGT-001',
        userId: driver1User._id,
        name: driver1User.name,
        phone: driver1User.phone,
        email: driver1User.email,
        assignedZone: 'ACADEMIC',
        assignedVehicleId: 'VEH-VAN-01',
        status: 'AVAILABLE',
        currentLocation: {
          lat: 12.9237,
          lng: 77.4987,
          lastUpdated: new Date()
        },
        assignedOrders: [],
        isActive: true
      },
      {
        agentId: 'AGT-002',
        userId: driver2User._id,
        name: driver2User.name,
        phone: driver2User.phone,
        email: driver2User.email,
        assignedZone: 'HOSTEL',
        assignedVehicleId: 'VEH-ECART-01',
        status: 'AVAILABLE',
        currentLocation: {
          lat: 12.9237,
          lng: 77.4987,
          lastUpdated: new Date()
        },
        assignedOrders: [],
        isActive: true
      }
    ];

    const seededAgents = await DeliveryAgent.insertMany(deliveryAgents);
    console.log(`Seeded ${seededAgents.length} Delivery Agents successfully.`);

    console.log('\n--- SEEDING COMPLETED SUCCESSFULLY ---');
    console.log(`Nodes: ${seededHubs.length}`);
    console.log(`Vehicles: ${seededVehicles.length}`);
    console.log(`Users: ${seededUsers.length}`);
    console.log(`Agents: ${seededAgents.length}`);

    return {
      nodesCount: seededHubs.length,
      vehiclesCount: seededVehicles.length,
      usersCount: seededUsers.length,
      agentsCount: seededAgents.length
    };
  } catch (error) {
    console.error('Error during database seeding:', error);
    throw error;
  } finally {
    if (!isAlreadyConnected && shouldDisconnect) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
    if (seedMongoMemoryServer && shouldDisconnect) {
      await seedMongoMemoryServer.stop();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDatabase;
