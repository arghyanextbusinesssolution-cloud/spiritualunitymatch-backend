import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSubscription, requirePlan } from '../middleware/subscription.js';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Engagement from '../models/Engagement.js';
import { uploadPhotos, uploadToCloudinary } from '../middleware/upload.js';

const router = express.Router(); 

// @route   POST /api/profiles
// @desc    Create or update user profile
// @access  Private
router.post('/', protect, uploadPhotos, async (req, res) => {
  try {
    const userId = req.user._id;
    let profileData = { ...req.body };

    // Parse JSON fields if they're strings (from FormData)
    if (typeof profileData.genderPreference === 'string') {
      try {
        profileData.genderPreference = JSON.parse(profileData.genderPreference);
      } catch (e) {
        profileData.genderPreference = [profileData.genderPreference];
      }
    }
    if (typeof profileData.spiritualBeliefs === 'string') {
      try {
        profileData.spiritualBeliefs = JSON.parse(profileData.spiritualBeliefs);
      } catch (e) {
        profileData.spiritualBeliefs = profileData.spiritualBeliefs ? [profileData.spiritualBeliefs] : [];
      }
    }
    if (typeof profileData.spiritualPractices === 'string') {
      try {
        profileData.spiritualPractices = JSON.parse(profileData.spiritualPractices);
      } catch (e) {
        profileData.spiritualPractices = profileData.spiritualPractices ? [profileData.spiritualPractices] : [];
      }
    }
    if (typeof profileData.lifestyleChoices === 'string') {
      try {
        profileData.lifestyleChoices = JSON.parse(profileData.lifestyleChoices);
      } catch (e) {
        profileData.lifestyleChoices = profileData.lifestyleChoices ? [profileData.lifestyleChoices] : [];
      }
    }
    if (typeof profileData.intentBadges === 'string') {
      try {
        profileData.intentBadges = JSON.parse(profileData.intentBadges);
      } catch (e) {
        profileData.intentBadges = profileData.intentBadges ? [profileData.intentBadges] : [];
      }
    }
    if (typeof profileData.ageRange === 'string') {
      try {
        profileData.ageRange = JSON.parse(profileData.ageRange);
      } catch (e) {
        // Keep default
      }
    }
    if (profileData.age && typeof profileData.age === 'string') {
      profileData.age = parseInt(profileData.age);
    }

    // Handle photo uploads
    const uploadedPhotos = [];
    if (req.files && req.files.length > 0) {
      // Limit to 5 photos
      const photosToUpload = req.files.slice(0, 5);
      
      // Upload each photo to Cloudinary
      for (let i = 0; i < photosToUpload.length; i++) {
        try {
          const result = await uploadToCloudinary(photosToUpload[i]);
          uploadedPhotos.push({
            url: result.secure_url,
            isPrimary: i === 0, // First photo is primary
            uploadedAt: new Date()
          });
        } catch (error) {
          console.error(`Error uploading photo ${i + 1}:`, error);
          return res.status(400).json({
            success: false,
            message: `Error uploading photo ${i + 1}: ${error.message}`
          });
        }
      }
    }

    // Check if profile exists
    let profile = await Profile.findOne({ user: userId });

    if (profile) {
      // Update existing profile
      Object.assign(profile, profileData);
      
      // Add new photos to existing photos (if any)
      if (uploadedPhotos.length > 0) {
        // Remove old primary flags
        profile.photos.forEach(photo => {
          photo.isPrimary = false;
        });
        
        // Add new photos
        profile.photos.push(...uploadedPhotos);
        
        // Ensure only first photo (or first new photo) is primary
        if (profile.photos.length > 0) {
          profile.photos[0].isPrimary = true;
          // Make sure only one photo is primary
          for (let i = 1; i < profile.photos.length; i++) {
            profile.photos[i].isPrimary = false;
          }
        }
        
        // Limit total photos to 5
        if (profile.photos.length > 5) {
          profile.photos = profile.photos.slice(0, 5);
          // Ensure first photo is primary
          if (profile.photos.length > 0) {
            profile.photos[0].isPrimary = true;
          }
        }
      }
    } else {
      // Create new profile
      profile = new Profile({
        user: userId,
        ...profileData,
        photos: uploadedPhotos.length > 0 ? uploadedPhotos : []
      });
    }

    // Ensure first photo is marked as primary if photos exist
    if (profile.photos && profile.photos.length > 0) {
      profile.photos[0].isPrimary = true;
      // Make sure only first photo is primary
      for (let i = 1; i < profile.photos.length; i++) {
        profile.photos[i].isPrimary = false;
      }
    }

    // Check if profile is complete
    const requiredFields = ['name', 'gender', 'age', 'relationshipIntention'];
    const isComplete = requiredFields.every(field => profile[field]);

    profile.isComplete = isComplete;

    // Auto-approve profiles for testing/development (can be disabled in production)
    // In production, profiles should be reviewed by admin
    if (isComplete && !profile.isApproved) {
      if (process.env.NODE_ENV !== 'production' || process.env.AUTO_APPROVE_PROFILES === 'true') {
        // Auto-approve for testing
        profile.isApproved = true;
        profile.approvalStatus = 'approved';
        console.log(`✅ [BACKEND] Auto-approved profile for user ${userId} (testing mode)`);
      } else {
        // Production: set to pending for admin review
        profile.approvalStatus = 'pending';
      }
    }

    await profile.save();

    // Create or update engagement record
    let engagement = await Engagement.findOne({ user: userId });
    if (!engagement) {
      engagement = new Engagement({ user: userId });
      await engagement.save();
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Profile save error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error saving profile'
    });
  }
});

// @route   GET /api/profiles/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id })
      .populate('user', 'email');

    if (!profile) {
      return res.json({
        success: true,
        profile: null
      });
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile'
    });
  }
});

// @route   GET /api/profiles/browse
// @desc    Browse profiles (with plan restrictions)
// @access  Private (requires subscription)
router.get('/browse', protect, requireSubscription, async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, filters = {} } = req.query;

    // Get user's profile for filtering
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: 'Please complete your profile first'
      });
    }

    // Get subscription to check plan limits
    const subscription = req.subscription;
    const isPremium = subscription.plan === 'premium';

    // Build query
    const query = {
      user: { $ne: userId }, // Exclude self
      isApproved: true,
      isComplete: true
    };

    // Gender preference filter
    if (userProfile.genderPreference && !userProfile.genderPreference.includes('all')) {
      query.gender = { $in: userProfile.genderPreference };
    }

    // Age range filter
    if (userProfile.ageRange) {
      query.age = {
        $gte: userProfile.ageRange.min,
        $lte: userProfile.ageRange.max
      };
    }

    // Premium filters (advanced)
    if (isPremium && filters.spiritualBeliefs) {
      query.spiritualBeliefs = { $in: filters.spiritualBeliefs };
    }

    if (isPremium && filters.spiritualPractices) {
      query.spiritualPractices = { $in: filters.spiritualPractices };
    }

    if (isPremium && filters.relationshipIntention) {
      query.relationshipIntention = filters.relationshipIntention;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get profiles
    let profiles = await Profile.find(query)
      .populate('user', 'email')
      .sort(isPremium ? { lastActive: -1 } : { createdAt: -1 }) // Premium gets priority
      .skip(skip)
      .limit(parseInt(limit));

    // For Basic plan, limit results
    if (subscription.plan === 'basic') {
      profiles = profiles.slice(0, 10); // Limited browsing
    }

    // Get total count
    const total = await Profile.countDocuments(query);

    res.json({
      success: true,
      profiles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Browse profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Error browsing profiles'
    });
  }
});

// @route   PATCH /api/profiles/edit-basic-info
// @desc    Edit basic profile info (name, email, spiritual beliefs & practices only)
// @access  Private
router.patch('/edit-basic-info', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email, spiritualBeliefs, spiritualPractices } = req.body;
    const errors = {};

    // Validate required fields
    if (!name || !name.trim()) {
      errors.name = 'Name is required';
    }
    if (!email || !email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = 'Email format is invalid';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Update user email in User model
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is already taken (if changed)
    if (email !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use',
          errors: { email: 'This email is already taken' }
        });
      }
      user.email = email.toLowerCase();
      await user.save();
    }

    // Update profile
    const profile = await Profile.findOne({ user: userId });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Only allow updating these 4 fields
    profile.name = name.trim();
    if (spiritualBeliefs && Array.isArray(spiritualBeliefs)) {
      profile.spiritualBeliefs = spiritualBeliefs;
    }
    if (spiritualPractices && Array.isArray(spiritualPractices)) {
      profile.spiritualPractices = spiritualPractices;
    }

    await profile.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile
    });
  } catch (error) {
    console.error('Edit profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating profile'
    });
  }
});

// @route   GET /api/profiles/:userId
// @desc    Get a specific user's profile
// @access  Private (requires subscription)
router.get('/:userId', protect, requireSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user._id;

    // Don't allow viewing own profile through this route
    if (userId === viewerId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Use /api/profiles/me to view your own profile'
      });
    }

    const profile = await Profile.findOne({ user: userId })
      .populate('user', 'email');

    if (!profile || !profile.isApproved || !profile.isComplete) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Increment profile views (if premium)
    const subscription = req.subscription;
    if (subscription.plan === 'premium') {
      profile.profileViews += 1;
      await profile.save();

      // Update engagement
      let engagement = await Engagement.findOne({ user: userId });
      if (engagement) {
        engagement.profileViews += 1;
        await engagement.save();
      }
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile'
    });
  }
});

// @route   POST /api/profiles/approve/:profileId
// @desc    Approve a profile (admin only)
// @access  Private (admin)
router.post('/approve/:profileId', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { profileId } = req.params;
    const { approved, reason } = req.body;

    const profile = await Profile.findById(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    if (approved) {
      profile.isApproved = true;
      profile.approvalStatus = 'approved';
      profile.rejectionReason = null;
    } else {
      profile.isApproved = false;
      profile.approvalStatus = 'rejected';
      profile.rejectionReason = reason || 'Profile did not meet guidelines';
    }

    await profile.save();

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Approve profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving profile'
    });
  }
});

export default router;

