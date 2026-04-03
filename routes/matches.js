import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import {
  getSuggestedMatches,
  likeUser,
  getMyMatches,
  getLikes,
  rejectUser
} from '../controllers/matchController.js';

const router = express.Router();

// @route   GET /api/matches/suggested
// @desc    Get suggested matches
// @access  Private (requires subscription)
router.get('/suggested', protect, requireSubscription, getSuggestedMatches);

// @route   POST /api/matches/like/:userId
// @desc    Like a user
// @access  Private (requires subscription)
router.post('/like/:userId', protect, requireSubscription, likeUser);

// @route   GET /api/matches/my-matches
// @desc    Get user's matches (mutual likes)
// @access  Private (requires subscription)
router.get('/my-matches', protect, requireSubscription, getMyMatches);

// @route   GET /api/matches/likes
// @desc    Get users who liked current user
// @access  Private (requires standard or premium)
router.get('/likes', protect, requireSubscription, getLikes);

// @route   POST /api/matches/reject/:userId
// @desc    Reject a user (hide for 7 days)
// @access  Private (requires subscription)
router.post('/reject/:userId', protect, requireSubscription, rejectUser);

export default router;
