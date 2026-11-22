const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/validate-username/:username', authController.validateUsername);
router.get('/validate-email/:email', authController.validateEmail);

// Protected routes
router.get('/me', protect, authController.getMe);
router.put('/me', protect, authController.updateProfile);
router.post('/logout', authController.logout);

module.exports = router;
