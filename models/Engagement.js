import mongoose from 'mongoose';

const engagementSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Engagement Metrics
  profileViews: {
    type: Number,
    default: 0
  },
  likesReceived: {
    type: Number,
    default: 0
  },
  likesSent: {
    type: Number,
    default: 0
  },
  matches: {
    type: Number,
    default: 0
  },
  messagesSent: {
    type: Number,
    default: 0
  },
  messagesReceived: {
    type: Number,
    default: 0
  },
  // Activity Tracking
  lastProfileView: {
    type: Date
  },
  lastLike: {
    type: Date
  },
  lastMatch: {
    type: Date
  },
  lastMessage: {
    type: Date
  },
  // Daily Limits (plan-based)
  dailyLikesUsed: {
    type: Number,
    default: 0
  },
  dailyLikesLimit: {
    type: Number,
    default: 5 // Basic plan default
  },
  dailyMessagesUsed: {
    type: Number,
    default: 0
  },
  dailyMessagesLimit: {
    type: Number,
    default: 0 // 0 = unlimited for paid plans
  },
  lastResetDate: {
    type: Date,
    default: Date.now
  },
  // Engagement Score (for ranking)
  engagementScore: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
engagementSchema.index({ user: 1 }, { unique: true });
engagementSchema.index({ engagementScore: -1 });
engagementSchema.index({ lastMessage: -1 });

// Method to reset daily limits (call this daily)
engagementSchema.methods.resetDailyLimits = function() {
  const today = new Date();
  const lastReset = new Date(this.lastResetDate);
  
  // If it's a new day, reset counters
  if (today.toDateString() !== lastReset.toDateString()) {
    this.dailyLikesUsed = 0;
    this.dailyMessagesUsed = 0;
    this.lastResetDate = today;
  }
};

// Method to calculate engagement score
engagementSchema.methods.calculateEngagementScore = function() {
  // Simple scoring: more activity = higher score
  // This helps rank active users higher in search results
  let score = 0;
  
  // Recent activity boosts score
  const now = new Date();
  const daysSinceLastMessage = this.lastMessage ? 
    (now - new Date(this.lastMessage)) / (1000 * 60 * 60 * 24) : 999;
  
  if (daysSinceLastMessage < 1) score += 50;
  else if (daysSinceLastMessage < 7) score += 30;
  else if (daysSinceLastMessage < 30) score += 10;
  
  // Profile completeness
  score += this.profileViews * 0.1;
  score += this.matches * 5;
  score += this.likesReceived * 0.5;
  
  this.engagementScore = Math.min(score, 100); // Cap at 100
};

const Engagement = mongoose.model('Engagement', engagementSchema);

export default Engagement;

