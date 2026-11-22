const Customer = require('../models/Customer');
const jwt = require('jsonwebtoken');
const config = require('../utils/config');

// Generate JWT Token with id and role
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    config.SECRET_KEY,
    { expiresIn: '7d' }
  );
};

// Register Campus User
const register = async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      phone,
      password,
      role = 'requester',
      campusId,
      department,
      defaultCampusNode
    } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, username, email, and password are required'
      });
    }

    // Validate role
    const validRoles = ['requester', 'driver', 'mailroom', 'admin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${validRoles.join(', ')}`
      });
    }

    // Check existing customer
    const existing = await Customer.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }

    // Create customer (pre-save hook hashes password with bcrypt)
    const customer = new Customer({
      name,
      username,
      email: email.toLowerCase(),
      phone,
      password,
      role,
      campusId,
      department,
      defaultCampusNode
    });

    await customer.save();

    const token = generateToken(customer);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        customer: customer.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// Login Campus User
const login = async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if ((!email && !username) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/username and password are required'
      });
    }

    // Find user by email or username
    const query = email ? { email: email.toLowerCase() } : { username };
    const customer = await Customer.findOne(query);

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!customer.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact campus administrator.'
      });
    }

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = generateToken(customer);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        customer: customer.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// Get Current Logged-in User Profile
const getMe = async (req, res) => {
  try {
    const customer = await Customer.findById(req.user._id).select('-password');
    res.status(200).json({
      success: true,
      data: {
        customer: customer.toJSON()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile',
      error: error.message
    });
  }
};

// Update Profile
const updateProfile = async (req, res) => {
  try {
    const allowedUpdates = ['name', 'phone', 'department', 'defaultCampusNode'];
    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const updated = await Customer.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        customer: updated.toJSON()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Profile update failed',
      error: error.message
    });
  }
};

// Validate Username Availability
const validateUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const existing = await Customer.findOne({ username });
    res.status(200).json({
      success: true,
      available: !existing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Validation failed',
      error: error.message
    });
  }
};

// Validate Email Availability
const validateEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const existing = await Customer.findOne({ email: email.toLowerCase() });
    res.status(200).json({
      success: true,
      available: !existing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Validation failed',
      error: error.message
    });
  }
};

// Logout
const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  validateUsername,
  validateEmail,
  logout,
  // Aliases for compatibility
  customerRegister: register,
  customerLogin: login,
  customerLogout: logout,
  getCurrentCustomer: getMe,
  updateCustomer: updateProfile
};
