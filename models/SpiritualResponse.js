import mongoose from 'mongoose';

const spiritualResponseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Spiritual Readiness Path Responses
  spiritualReadiness: {
    // Guided Questions
    questions: [{
      questionId: String,
      question: String,
      answer: String,
      answeredAt: { type: Date, default: Date.now }
    }],
    // Spiritual Growth
    spiritualGrowth: {
      stage: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'teacher'],
        default: 'beginner'
      },
      description: String
    },
    // Conflict Handling
    conflictHandling: {
      approach: {
        type: String,
        enum: ['avoidant', 'confrontational', 'collaborative', 'mindful'],
        default: 'collaborative'
      },
      description: String
    },
    // Life Purpose
    lifePurpose: {
      clarity: {
        type: String,
        enum: ['very-clear', 'somewhat-clear', 'exploring', 'uncertain'],
        default: 'exploring'
      },
      description: String
    },
    // Overall Readiness Score
    readinessScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  // Soul-Based Matching Data
  soulMatching: {
    energyBalance: {
      type: String,
      enum: ['grounded', 'elevated', 'balanced', 'seeking-balance'],
      default: 'seeking-balance'
    },
    lifeMission: {
      type: String,
      maxlength: 500
    },
    healingJourney: {
      stage: {
        type: String,
        enum: ['beginning', 'in-progress', 'advanced', 'maintaining'],
        default: 'beginning'
      },
      description: String
    }
  },
  // Connection Ritual Progress
  connectionRituals: [{
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match'
    },
    day: {
      type: Number,
      min: 1,
      max: 7
    },
    reflection: String,
    intention: String,
    completedAt: Date
  }]
}, {
  timestamps: true
});

// Indexes
spiritualResponseSchema.index({ user: 1 }, { unique: true });
spiritualResponseSchema.index({ 'spiritualReadiness.readinessScore': -1 });

const SpiritualResponse = mongoose.model('SpiritualResponse', spiritualResponseSchema);

export default SpiritualResponse;

