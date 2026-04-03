import express from 'express';
import { protect } from '../middleware/auth.js';
import SoulCheckIn from '../models/SoulCheckIn.js';
import SoulJournal from '../models/SoulJournal.js';
import SoulReadiness from '../models/SoulReadiness.js';
import ConnectionRitual from '../models/ConnectionRitual.js';
import Match from '../models/Match.js';

const router = express.Router();

// @route   POST /api/soul/check-in
// @desc    Create daily check-in
// @access  Private
router.post('/check-in', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { emotion, need, energy, notes } = req.body;

    // Get today's date at start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if check-in already exists for today
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const existingCheckIn = await SoulCheckIn.findOne({
      user: userId,
      date: { $gte: today, $lte: todayEnd }
    });

    if (existingCheckIn) {
      // Cannot edit once checked in today
      return res.status(400).json({
        success: false,
        message: 'You have already checked in today. Check-ins cannot be modified once saved.',
        checkIn: existingCheckIn
      });
    }

    // Create new check-in
    const checkIn = new SoulCheckIn({
      user: userId,
      emotion,
      need,
      energy,
      notes,
      date: new Date()
    });

    await checkIn.save();

    res.json({
      success: true,
      checkIn,
      message: 'Check-in saved successfully'
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving check-in'
    });
  }
});

// @route   GET /api/soul/check-in
// @desc    Get today's check-in
// @access  Private
router.get('/check-in', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkIn = await SoulCheckIn.findOne({
      user: userId,
      date: { $gte: today }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      checkIn: checkIn || null
    });
  } catch (error) {
    console.error('Get check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching check-in'
    });
  }
});

// @route   GET /api/soul/check-in/history
// @desc    Get check-in history for calendar
// @access  Private
router.get('/check-in/history', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { month, year } = req.query;

    // Default to current month if not provided
    const targetDate = new Date(year || new Date().getFullYear(), (month || new Date().getMonth()), 1);
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const checkIns = await SoulCheckIn.find({
      user: userId,
      date: { $gte: startOfMonth, $lte: endOfMonth }
    }).sort({ date: 1 });

    // Create a map of date strings to check-ins
    const checkInMap = {};
    checkIns.forEach(checkIn => {
      const dateStr = checkIn.date.toISOString().split('T')[0];
      checkInMap[dateStr] = {
        emotion: checkIn.emotion,
        need: checkIn.need,
        energy: checkIn.energy,
        hasCheckIn: true
      };
    });

    res.json({
      success: true,
      checkIns: checkInMap,
      month: targetDate.getMonth(),
      year: targetDate.getFullYear()
    });
  } catch (error) {
    console.error('Get check-in history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching check-in history'
    });
  }
});

// @route   GET /api/soul/score
// @desc    Get user's soul score (based on check-ins, journal entries, etc.)
// @access  Private
router.get('/score', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Calculate soul score based on:
    // 1. Check-in consistency (last 30 days)
    // 2. Recent activity (journal entries, etc.)
    // 3. Engagement with soul features
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Count check-ins in last 30 days
    const checkInCount = await SoulCheckIn.countDocuments({
      user: userId,
      date: { $gte: thirtyDaysAgo }
    });
    
    // Count journal entries in last 30 days
    const journalCount = await SoulJournal.countDocuments({
      user: userId,
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    // Calculate base score (out of 100)
    // Max 30 check-ins = 30 days, so each check-in = ~3.33 points (max 50 points)
    // Journal entries bonus: max 25 points
    // Consistency bonus: max 25 points
    
    let score = 0;
    
    // Check-in score (0-50 points)
    const checkInScore = Math.min(checkInCount * (50 / 30), 50);
    score += checkInScore;
    
    // Journal score (0-25 points, max 10 entries = full points)
    const journalScore = Math.min(journalCount * (25 / 10), 25);
    score += journalScore;
    
    // Consistency bonus (0-25 points)
    // If user has checked in at least 20 out of 30 days, get full bonus
    const consistencyRatio = checkInCount / 30;
    const consistencyScore = Math.min(consistencyRatio * 25 / 0.67, 25);
    score += consistencyScore;
    
    // Round to nearest integer
    score = Math.round(score);
    
    // Ensure score is between 0 and 100
    score = Math.min(Math.max(score, 0), 100);
    
    res.json({
      success: true,
      score,
      breakdown: {
        checkIns: checkInCount,
        checkInScore: Math.round(checkInScore),
        journalEntries: journalCount,
        journalScore: Math.round(journalScore),
        consistencyScore: Math.round(consistencyScore)
      }
    });
  } catch (error) {
    console.error('Get soul score error:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating soul score'
    });
  }
});

// @route   POST /api/soul/journal
// @desc    Create journal entry
// @access  Private
router.post('/journal', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, content, type, prompt, tags, isGratitude } = req.body;

    const journal = new SoulJournal({
      user: userId,
      title,
      content,
      type: type || 'free-write',
      prompt,
      tags: tags || [],
      isGratitude: isGratitude || false
    });

    await journal.save();

    res.json({
      success: true,
      journal
    });
  } catch (error) {
    console.error('Journal error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving journal entry'
    });
  }
});

// @route   GET /api/soul/journal
// @desc    Get journal entries
// @access  Private
router.get('/journal', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, type } = req.query;

    const query = { user: userId };
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const entries = await SoulJournal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SoulJournal.countDocuments(query);

    res.json({
      success: true,
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get journal error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching journal entries'
    });
  }
});

// @route   GET /api/soul/readiness
// @desc    Get spiritual readiness progress
// @access  Private
router.get('/readiness', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    let readiness = await SoulReadiness.findOne({ user: userId });

    if (!readiness) {
      readiness = new SoulReadiness({
        user: userId,
        stage: 'knowing-self',
        progress: new Map()
      });
      await readiness.save();
    }

    res.json({
      success: true,
      readiness
    });
  } catch (error) {
    console.error('Get readiness error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching readiness'
    });
  }
});

// @route   POST /api/soul/readiness
// @desc    Update spiritual readiness progress
// @access  Private
router.post('/readiness', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { stage, questionId, answers, currentStageProgress } = req.body;

    let readiness = await SoulReadiness.findOne({ user: userId });

    if (!readiness) {
      readiness = new SoulReadiness({
        user: userId,
        stage: stage || 'knowing-self',
        progress: new Map()
      });
    }

    if (stage) readiness.stage = stage;
    if (currentStageProgress !== undefined) readiness.currentStageProgress = currentStageProgress;
    if (questionId && answers) {
      if (!readiness.progress) readiness.progress = new Map();
      readiness.progress.set(questionId, {
        completed: true,
        answers: Array.isArray(answers) ? answers : [answers],
        completedAt: new Date()
      });
    }

    await readiness.save();

    res.json({
      success: true,
      readiness
    });
  } catch (error) {
    console.error('Update readiness error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating readiness'
    });
  }
});

// @route   GET /api/soul/rituals/:matchId
// @desc    Get connection rituals for a match
// @access  Private
router.get('/rituals/:matchId', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { matchId } = req.params;

    // Verify the match belongs to the user
    const match = await Match.findById(matchId);
    if (!match || (match.user1.toString() !== userId.toString() && match.user2.toString() !== userId.toString())) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    const rituals = await ConnectionRitual.find({ match: matchId })
      .sort({ day: 1 });

    res.json({
      success: true,
      rituals
    });
  } catch (error) {
    console.error('Get rituals error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching rituals'
    });
  }
});

// @route   POST /api/soul/rituals/:matchId
// @desc    Create or update connection ritual
// @access  Private
router.post('/rituals/:matchId', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { matchId } = req.params;
    const { day, response, sharedIntentions } = req.body;

    // Verify the match belongs to the user
    const match = await Match.findById(matchId);
    if (!match || (match.user1.toString() !== userId.toString() && match.user2.toString() !== userId.toString())) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    let ritual = await ConnectionRitual.findOne({ match: matchId, day });

    if (!ritual) {
      const prompt = getPromptForDay(day);
      ritual = new ConnectionRitual({
        match: matchId,
        user1: match.user1,
        user2: match.user2,
        day,
        prompt
      });
    }

    // Update response based on which user
    if (match.user1.toString() === userId.toString()) {
      ritual.user1Response = response;
    } else {
      ritual.user2Response = response;
    }

    if (sharedIntentions) {
      ritual.sharedIntentions = sharedIntentions;
    }

    // Mark as completed if both users have responded
    if (ritual.user1Response && ritual.user2Response) {
      ritual.completed = true;
      ritual.completedAt = new Date();
    }

    await ritual.save();

    res.json({
      success: true,
      ritual
    });
  } catch (error) {
    console.error('Ritual error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving ritual'
    });
  }
});

// Helper function for prompts
function getPromptForDay(day) {
  const prompts = {
    1: "What makes you feel safe with someone?",
    2: "What does commitment mean to you?",
    3: "How do you express love?",
    4: "What are your relationship dreams?",
    5: "How do you handle conflict in relationships?",
    6: "What does intimacy mean to you?",
    7: "What are your hopes for this connection?"
  };
  return prompts[day] || "Share something meaningful with your match.";
}

export default router;