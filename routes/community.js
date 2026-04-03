import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import Community from '../models/Community.js';

const router = express.Router();

// @route   GET /api/community/circles
// @desc    Get spiritual circles
// @access  Private (requires subscription)
router.get('/circles', protect, requireSubscription, async (req, res) => {
  try {
    const circles = await Community.find({ isPublic: true })
      .populate('members.user', 'email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      circles
    });
  } catch (error) {
    console.error('Get circles error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching circles'
    });
  }
});

// @route   POST /api/community/circles
// @desc    Create a spiritual circle
// @access  Private (requires subscription)
router.post('/circles', protect, requireSubscription, async (req, res) => {
  try {
    const { name, description, type } = req.body;

    const circle = new Community({
      name,
      description,
      type: type || 'spiritual-circle',
      members: [{
        user: req.user._id,
        role: 'admin'
      }]
    });

    await circle.save();

    res.status(201).json({
      success: true,
      circle
    });
  } catch (error) {
    console.error('Create circle error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating circle'
    });
  }
});

// @route   POST /api/community/circles/:circleId/join
// @desc    Join a spiritual circle
// @access  Private (requires subscription)
router.post('/circles/:circleId/join', protect, requireSubscription, async (req, res) => {
  try {
    const { circleId } = req.params;
    const userId = req.user._id;

    const circle = await Community.findById(circleId);
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }

    // Check if already a member
    const isMember = circle.members.some(
      m => m.user.toString() === userId.toString()
    );

    if (isMember) {
      return res.status(400).json({
        success: false,
        message: 'Already a member of this circle'
      });
    }

    // Check max members
    if (circle.members.length >= circle.maxMembers) {
      return res.status(400).json({
        success: false,
        message: 'Circle is full'
      });
    }

    // Add member
    circle.members.push({
      user: userId,
      role: 'member'
    });

    await circle.save();

    res.json({
      success: true,
      circle
    });
  } catch (error) {
    console.error('Join circle error:', error);
    res.status(500).json({
      success: false,
      message: 'Error joining circle'
    });
  }
});

export default router;

