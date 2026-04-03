import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Like Status
  user1Liked: {
    type: Boolean,
    default: false
  },
  user2Liked: {
    type: Boolean,
    default: false
  },
  // Match Status
  isMatch: {
    type: Boolean,
    default: false
  },
  matchedAt: {
    type: Date
  },
  // Match Score (from algorithm)
  matchScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Match Labels (why they matched)
  matchLabels: [{
    type: String,
    enum: [
      'aligned-in-purpose',
      'aligned-in-spiritual-rhythm',
      'similar-lifestyle',
      'compatible-intent',
      'spiritual-synergy'
    ]
  }],
  // Compatibility Breakdown
  compatibility: {
    spiritual: { type: Number, default: 0 },
    lifestyle: { type: Number, default: 0 },
    intent: { type: Number, default: 0 },
    values: { type: Number, default: 0 }
  },
  // Interaction
  lastInteraction: {
    type: Date
  },
  // Connection Ritual Status
  connectionRitualStarted: {
    type: Boolean,
    default: false
  },
  connectionRitualDay: {
    type: Number,
    default: 0,
    min: 0,
    max: 7
  }
}, {
  timestamps: true
});

// Indexes - ensure unique pairs and fast lookups
matchSchema.index({ user1: 1, user2: 1 }, { unique: true });
matchSchema.index({ user1: 1, isMatch: 1 });
matchSchema.index({ user2: 1, isMatch: 1 });
matchSchema.index({ matchScore: -1 });
matchSchema.index({ matchedAt: -1 });

// Method to check if it's a mutual match
matchSchema.methods.isMutualMatch = function() {
  return this.user1Liked && this.user2Liked;
};

const Match = mongoose.model('Match', matchSchema);

export default Match;

