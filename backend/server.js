const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');

// Centralized configuration
const config = require('./src/utils/config');
const seedDatabase = require('./test/seedDatabase');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const deliveryRoutes = require('./src/routes/deliveryRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const docsRoutes = require('./src/routes/docsRoutes');
const deliveryController = require('./src/controllers/deliveryController');

const app = express();
const server = http.createServer(app);
const PORT = config.PORT || 3000;

// CORS configuration supporting frontend URL
const allowedOrigins = [
  config.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:3000'
];

// Initialize Socket.io with cross-origin support
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Attach Socket.io instance to app for controllers
app.set('io', io);

io.on('connection', (socket) => {
  if (config.NODE_ENV === 'development') {
    console.log(`🔌 Client connected to Socket.io [id: ${socket.id}]`);
  }
  socket.on('disconnect', () => {
    if (config.NODE_ENV === 'development') {
      console.log(`🔌 Client disconnected [id: ${socket.id}]`);
    }
  });
});

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in dev
  },
  credentials: true
}));

// Session configuration
app.use(session({
  secret: config.SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static('uploads'));

// In-Memory MongoDB Server Instance
let mongoMemoryServer = null;

/**
 * Database connection logic with automatic in-memory fallback for local development
 */
async function connectDatabase() {
  const isDev = (process.env.NODE_ENV || 'development') === 'development';

  try {
    // Attempt standard connection to MONGO_URI
    await mongoose.connect(config.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 2000,
      socketTimeoutMS: 45000
    });
    console.log(`Connected to MongoDB at: ${config.MONGO_URI}`);
  } catch (error) {
    const isConnRefused =
      error.message?.includes('ECONNREFUSED') ||
      error.name === 'MongooseServerSelectionError';

    if (isDev && isConnRefused) {
      console.log('⚠️  Local MongoDB unavailable (ECONNREFUSED). Initializing In-Memory Fallback...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongoMemoryServer = await MongoMemoryServer.create();
        const memoryUri = mongoMemoryServer.getUri();

        await mongoose.connect(memoryUri);
        console.log(`⚡ Running with in-memory MongoDB + auto-seeded campus data (${memoryUri})`);

        // Automatically seed campus data
        await seedDatabase(memoryUri, false);
      } catch (memError) {
        console.error('❌ Failed to initialize in-memory MongoDB:', memError.message);
      }
    } else {
      console.warn('MongoDB connection warning:', error.message);
    }
  }
}

// Connect to MongoDB if not in test environment
if (process.env.NODE_ENV !== 'test') {
  connectDatabase();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Campus Freight & Delivery Management System',
    timestamp: new Date().toISOString()
  });
});

// Mount active routes
app.get('/api/nodes', (req, res) => deliveryController.getCampusNodes(req, res));
app.get('/api/nodes/:hubId', (req, res) => deliveryController.getCampusNodeById(req, res));
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api', deliveryRoutes); // Supports /api/vehicles and /api/nodes direct routes
app.use('/api/ai', aiRoutes);
app.use('/api/docs', docsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: config.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route '${req.originalUrl}' not found`
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
  process.exit(0);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Campus Freight Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
    console.log(`⚡ Real-time Socket.io active`);
  });
}

module.exports = app;
module.exports.server = server;
module.exports.io = io;
module.exports.connectDatabase = connectDatabase;
module.exports.getMongoMemoryServer = () => mongoMemoryServer;
