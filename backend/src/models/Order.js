const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  trackingId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  status: {
    type: String,
    enum: [
      'PENDING_APPROVAL',
      'PENDING',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'DELIVERED',
      'DELIVERY_ATTEMPTED',
      'RETURNED_TO_MAILROOM',
      'CANCELLED'
    ],
    default: 'PENDING'
  },
  priority: {
    type: String,
    enum: ['STANDARD', 'URGENT', 'BULK'],
    default: 'STANDARD'
  },
  pickupNode: {
    hubId: {
      type: String,
      required: true,
      trim: true
    },
    buildingName: {
      type: String,
      required: true,
      trim: true
    },
    roomNumber: {
      type: String,
      trim: true
    },
    contactPhone: {
      type: String,
      trim: true
    }
  },
  dropoffNode: {
    hubId: {
      type: String,
      required: true,
      trim: true
    },
    buildingName: {
      type: String,
      required: true,
      trim: true
    },
    roomNumber: {
      type: String,
      trim: true
    },
    recipientName: {
      type: String,
      required: true,
      trim: true
    },
    recipientPhone: {
      type: String,
      required: true,
      trim: true
    }
  },
  cargoDetails: {
    itemCategory: {
      type: String,
      enum: ['LAB_EQUIPMENT', 'DOCUMENTS', 'HOSTEL_PARCEL', 'MAINTENANCE', 'BULK_SUPPLY'],
      required: true
    },
    description: {
      type: String,
      trim: true
    },
    weightKg: {
      type: Number
    },
    dimensionsCm: {
      length: Number,
      width: Number,
      height: Number
    },
    isFragile: {
      type: Boolean,
      default: false
    },
    requiresAdminApproval: {
      type: Boolean,
      default: false
    },
    specialInstructions: {
      type: String,
      trim: true
    }
  },
  externalTrackingId: {
    type: String,
    trim: true
  },
  assignment: {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryAgent'
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryVehicle'
    },
    assignedAt: {
      type: Date
    }
  },
  pod: {
    otp: {
      type: String,
      trim: true
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date
    },
    deliveryNotes: {
      type: String,
      trim: true
    },
    failedReason: {
      type: String,
      trim: true
    }
  },
  estimatedDeliveryMinutes: {
    type: Number
  },
  statusHistory: [{
    status: {
      type: String
    },
    updatedBy: {
      type: mongoose.Schema.Types.Mixed
    },
    note: {
      type: String,
      trim: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Query indexes (without duplicating unique trackingId)
orderSchema.index({ requesterId: 1, status: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'pickupNode.hubId': 1 });
orderSchema.index({ 'dropoffNode.hubId': 1 });
orderSchema.index({ externalTrackingId: 1 }, { sparse: true });

module.exports = mongoose.model('Order', orderSchema);
