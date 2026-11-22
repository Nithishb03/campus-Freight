const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientType: {
    type: String,
    enum: ['DRIVER', 'MAILROOM', 'REQUESTER', 'ADMIN'],
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    enum: ['DeliveryAgent', 'DeliveryHub', 'CampusNode', 'Customer', 'User'],
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  type: {
    type: String,
    enum: [
      'REQUEST_CREATED',
      'APPROVAL_REQUIRED',
      'DRIVER_ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'DELIVERED',
      'DELIVERY_ATTEMPTED',
      'CANCELLED'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  channels: {
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    email: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ'],
    default: 'PENDING'
  },
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  attempts: {
    type: Number,
    default: 0
  },
  lastAttemptAt: Date,
  errorMessage: String,
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ orderId: 1 });
notificationSchema.index({ status: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

// Instance methods
notificationSchema.methods.markAsRead = function() {
  this.status = 'READ';
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsSent = function() {
  this.status = 'SENT';
  this.sentAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDelivered = function() {
  this.status = 'DELIVERED';
  this.deliveredAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'FAILED';
  this.errorMessage = errorMessage;
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);
