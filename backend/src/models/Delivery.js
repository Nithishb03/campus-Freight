const mongoose = require('mongoose');

// DeliveryHub / CampusNode (Campus Nodes/Buildings in 3D & Geo Coordinates)
const deliveryHubSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  hubId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  zone: {
    type: String,
    enum: ['ADMIN', 'ACADEMIC', 'HOSTEL', 'SPORTS', 'UTILITY'],
    required: true
  },
  mapPosition: {
    x: {
      type: Number,
      required: true
    },
    y: {
      type: Number,
      required: true
    },
    z: {
      type: Number,
      default: 0
    }
  },
  dimensions: {
    width: {
      type: Number,
      default: 80
    },
    depth: {
      type: Number,
      default: 60
    },
    height: {
      type: Number,
      default: 35
    }
  },
  coordinates: {
    lat: {
      type: Number
    },
    lng: {
      type: Number
    }
  },
  isPedestrianOnly: {
    type: Boolean,
    default: false
  },
  accessibleBy: [{
    type: String,
    enum: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY']
  }],
  isMailroom: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  aliases: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Auto-sync code and hubId, and assign vehicle accessibility according to pedestrian status
deliveryHubSchema.pre('validate', function(next) {
  if (!this.code && this.hubId) {
    this.code = this.hubId;
  }
  if (!this.hubId && this.code) {
    this.hubId = this.code;
  }
  if (this.isPedestrianOnly) {
    if (!this.accessibleBy || this.accessibleBy.length === 0) {
      this.accessibleBy = ['ECART', 'HAND_TROLLEY'];
    }
  } else if (!this.accessibleBy || this.accessibleBy.length === 0) {
    this.accessibleBy = ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'];
  }
  next();
});

// DeliveryVehicle (Campus Fleet)
const deliveryVehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['VAN', 'ECART', 'CARGO_BIKE', 'HAND_TROLLEY'],
    required: true
  },
  registrationNumber: {
    type: String,
    required: true,
    trim: true
  },
  maxWeightKg: {
    type: Number,
    required: true
  },
  currentLoadKg: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['AVAILABLE', 'IN_TRANSIT', 'MAINTENANCE'],
    default: 'AVAILABLE'
  },
  currentHubId: {
    type: String,
    trim: true
  },
  assignedOrders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// DeliveryAgent (Campus Drivers/Operators)
const deliveryAgentSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  assignedZone: {
    type: String,
    trim: true
  },
  assignedVehicleId: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['AVAILABLE', 'ON_DELIVERY', 'OFF_DUTY'],
    default: 'AVAILABLE'
  },
  currentLocation: {
    lat: Number,
    lng: Number,
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  assignedOrders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const DeliveryHub = mongoose.model('DeliveryHub', deliveryHubSchema);
const CampusNode = DeliveryHub;
const DeliveryAgent = mongoose.model('DeliveryAgent', deliveryAgentSchema);
const DeliveryVehicle = mongoose.model('DeliveryVehicle', deliveryVehicleSchema);

module.exports = {
  DeliveryHub,
  CampusNode,
  DeliveryAgent,
  DeliveryVehicle
};
