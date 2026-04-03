import express from 'express';
import { protect } from '../middleware/auth.js';
import SpiritualResponse from '../models/SpiritualResponse.js';
import Match from '../models/Match.js';

const router = express.Router();

// @route   POST /api/spiritual/readiness
// @desc    Save spiritual readiness responses
// @access  Private
router.post('/readiness', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { questions, spiritualGrowth, conflictHandling, lifePurpose } = req.body;

    let spiritualResponse = await SpiritualResponse.findOne({ user: userId });

    if (!spiritualResponse) {
      spiritualResponse = new SpiritualResponse({ user: userId });
    }

    // Update spiritual readiness data
    if (questions) {
      spiritualResponse.spiritualReadiness.questions = questions;
    }
    if (spiritualGrowth) {
      spiritualResponse.spiritualReadiness.spiritualGrowth = spiritualGrowth;
    }
    if (conflictHandling) {
      spiritualResponse.spiritualReadiness.conflictHandling = conflictHandling;
    }
    if (lifePurpose) {
      spiritualResponse.spiritualReadiness.lifePurpose = lifePurpose;
    }

    // Calculate readiness score (simple scoring)
    let score = 0;
    let factors = 0;

    if (spiritualResponse.spiritualReadiness.questions?.length > 0) {
      score += 30;
      factors++;
    }
    if (spiritualResponse.spiritualReadiness.spiritualGrowth?.stage) {
      score += 25;
      factors++;
    }
    if (spiritualResponse.spiritualReadiness.conflictHandling?.approach) {
      score += 25;
      factors++;
    }
    if (spiritualResponse.spiritualReadiness.lifePurpose?.clarity) {
      score += 20;
      factors++;
    }

    spiritualResponse.spiritualReadiness.readinessScore = factors > 0 ? score : 0;

    await spiritualResponse.save();

    res.json({
      success: true,
      spiritualResponse
    });
  } catch (error) {
    console.error('Save spiritual readiness error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving spiritual readiness'
    });
  }
});

// @route   GET /api/spiritual/readiness
// @desc    Get spiritual readiness data
// @access  Private
router.get('/readiness', protect, async (req, res) => {
  try {
    const spiritualResponse = await SpiritualResponse.findOne({ user: req.user._id });

    if (!spiritualResponse) {
      return res.json({
        success: true,
        spiritualResponse: null
      });
    }

    res.json({
      success: true,
      spiritualResponse
    });
  } catch (error) {
    console.error('Get spiritual readiness error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching spiritual readiness'
    });
  }
});

// @route   POST /api/spiritual/connection-ritual/:matchId
// @desc    Update connection ritual progress
// @access  Private
router.post('/connection-ritual/:matchId', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { matchId } = req.params;
    const { day, reflection, intention } = req.body;

    // Verify match exists and user is part of it
    const match = await Match.findById(matchId);
    if (!match || 
        (match.user1.toString() !== userId.toString() && 
         match.user2.toString() !== userId.toString())) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    if (!match.isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Connection ritual only available for matches'
      });
    }

    // Start connection ritual if not started
    if (!match.connectionRitualStarted) {
      match.connectionRitualStarted = true;
      match.connectionRitualDay = 1;
    }

    // Update ritual day
    if (day) {
      match.connectionRitualDay = Math.min(day, 7);
    }

    await match.save();

    // Save to spiritual response
    let spiritualResponse = await SpiritualResponse.findOne({ user: userId });
    if (!spiritualResponse) {
      spiritualResponse = new SpiritualResponse({ user: userId });
    }

    // Update or add connection ritual
    const existingRitual = spiritualResponse.connectionRituals.find(
      r => r.match.toString() === matchId
    );

    if (existingRitual) {
      existingRitual.day = day || existingRitual.day;
      existingRitual.reflection = reflection || existingRitual.reflection;
      existingRitual.intention = intention || existingRitual.intention;
      existingRitual.completedAt = new Date();
    } else {
      spiritualResponse.connectionRituals.push({
        match: matchId,
        day: day || 1,
        reflection,
        intention,
        completedAt: new Date()
      });
    }

    await spiritualResponse.save();

    res.json({
      success: true,
      match,
      spiritualResponse
    });
  } catch (error) {
    console.error('Update connection ritual error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating connection ritual'
    });
  }
});

export default router;

