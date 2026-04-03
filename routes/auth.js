import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Helper function to generate JWT token
// Like creating a special ticket that proves who you are
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Helper function to set token cookie
const setTokenCookie = (res, token) => {
  console.log('🔐 [BACKEND] Setting token cookie:', { 
    tokenLength: token.length,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/' // Ensure cookie is available on all routes
  });
  
  console.log('✅ [BACKEND] Token cookie set successfully');
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create new user (password will be hashed automatically by User model)
    const user = await User.create({
      email,
      password
    });

    // Generate token
    const token = generateToken(user._id);
    console.log('🔐 [BACKEND] User registered, token generated for:', user.email);

    // Set cookie (HTTP-only for security)
    setTokenCookie(res, token);

    // Return user data (without password)
    // Also return token in response so frontend can store it in localStorage as backup
    res.status(201).json({
      success: true,
      token, // Return token in response body too (for localStorage backup)
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
    
    console.log('✅ [BACKEND] Registration response sent');
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if suspended
    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended',
        reason: user.suspensionReason
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);
    console.log('🔐 [BACKEND] User logged in, token generated for:', user.email);

    // Set cookie (HTTP-only for security)
    setTokenCookie(res, token);

    res.json({
      success: true,
      token, // Return token in response body too (for localStorage backup)
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
    
    console.log('✅ [BACKEND] Login response sent');
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    console.log('👤 [BACKEND] Getting user info for:', req.user.email);
    
    // Get user profile if exists
    const profile = await Profile.findOne({ user: req.user._id });

    const userData = {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      isEmailVerified: req.user.isEmailVerified,
      hasProfile: !!profile,
      profileComplete: profile?.isComplete || false,
      profileApproved: profile?.isApproved || false
    };

    console.log('✅ [BACKEND] User info retrieved:', userData.email);
    
    res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    console.error('❌ [BACKEND] Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

export default router;

