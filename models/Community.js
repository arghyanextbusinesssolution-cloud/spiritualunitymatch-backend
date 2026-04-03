import mongoose from 'mongoose';

const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 1000
  },
  // Spiritual Circle Type
  type: {
    type: String,
    enum: ['spiritual-circle', 'meditation-group', 'discussion-group', 'event-group'],
    default: 'spiritual-circle'
  },
  // Members
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Group Meditation
  upcomingMeditations: [{
    title: String,
    scheduledAt: Date,
    isLive: { type: Boolean, default: false },
    recordingUrl: String,
    description: String
  }],
  // Content Feed
  posts: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    mediaUrl: String,
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    comments: [{
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      content: String,
      createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
  }],
  // Settings
  isPublic: {
    type: Boolean,
    default: true
  },
  maxMembers: {
    type: Number,
    default: 100
  }
}, {
  timestamps: true
});

// Indexes
communitySchema.index({ type: 1 });
communitySchema.index({ 'members.user': 1 });
communitySchema.index({ createdAt: -1 });

const Community = mongoose.model('Community', communitySchema);

export default Community;

