import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Middleware to protect routes - checks if user is logged in
// Like a bouncer at a club - only lets in people with valid tickets (tokens)
export const protect = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const cookieToken = req.cookies.token;
    const headerToken = req.headers.authorization?.replace('Bearer ', '');
    let token = cookieToken || headerToken;

    // Only log for /auth/me to reduce spam
    const isAuthMe = req.path.includes('/auth/me');
    
    if (isAuthMe) {
      console.log('🔐 [BACKEND] Auth check:', {
        path: req.path,
        hasCookieToken: !!cookieToken,
        hasHeaderToken: !!headerToken,
        tokenLength: token ? token.length : 0
      });
    }

    if (!token) {
      if (isAuthMe) {
        console.log('❌ [BACKEND] No token found for /auth/me');
      }
      return res.status(401).json({
        success: false,
        message: 'Not authorized - no token provided'
      });
    }

    // Verify the token (check if it's real and not expired)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (isAuthMe) {
      console.log('✅ [BACKEND] Token verified, user ID:', decoded.id);
    }

    // Find the user and attach to request
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      if (isAuthMe) {
        console.log('❌ [BACKEND] User not found for ID:', decoded.id);
      }
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      if (isAuthMe) {
        console.log('⚠️ [BACKEND] User suspended:', user.email);
      }
      return res.status(403).json({
        success: false,
        message: 'Account is suspended'
      });
    }

    if (isAuthMe) {
      console.log('✅ [BACKEND] User authenticated:', user.email);
    }
    
    req.user = user;
    next();
  } catch (error) {
    const isAuthMe = req.path.includes('/auth/me');
    if (isAuthMe) {
      console.error('❌ [BACKEND] Auth error:', error.message);
    }
    res.status(401).json({
      success: false,
      message: 'Not authorized - invalid token'
    });
  }
};

// Middleware to check if user is admin
// Like a VIP pass - only admins get through
export const adminOnly = async (req, res, next) => {
  try {
    // First check if user is authenticated using protect middleware
    return protect(req, res, () => {
      // Then check if they're an admin
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      next();
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
};

