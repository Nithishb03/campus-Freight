const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const customerSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },

  // Authentication
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['requester', 'driver', 'mailroom', 'admin'],
    default: 'requester'
  },

  // Campus Attributes
  campusId: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  defaultCampusNode: {
    type: String,
    trim: true
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Password hashing middleware
customerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Password comparison method
customerSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive fields from JSON output
customerSchema.methods.toJSON = function() {
  const customerObject = this.toObject();
  delete customerObject.password;
  return customerObject;
};

module.exports = mongoose.model('Customer', customerSchema);
