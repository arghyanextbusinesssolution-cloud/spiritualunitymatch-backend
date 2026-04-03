import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Basic Info
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  nickname: {
    type: String,
    trim: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say'],
    required: true
  },
  genderPreference: {
    type: [String],
    enum: ['male', 'female', 'non-binary', 'all'],
    default: ['all']
  },
  age: {
    type: Number,
    required: true,
    min: 18,
    max: 120
  },
  ageRange: {
    min: { type: Number, default: 18 },
    max: { type: Number, default: 120 }
  },
  // Location
  location: {
    city: String,
    state: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  maxDistance: {
    type: Number,
    default: 50 // miles/km
  },
  // Spiritual Information
  spiritualBeliefs: {
    type: [String],
    enum: [
      'buddhism', 'christianity', 'hinduism', 'islam', 'judaism',
      'spiritual-but-not-religious', 'atheist', 'agnostic', 'pagan',
      'new-age', 'yoga-practitioner', 'meditation', 'other'
    ]
  },
  spiritualPractices: {
    type: [String],
    enum: [
      'meditation', 'yoga', 'prayer', 'chanting', 'energy-healing',
      'astrology', 'tarot', 'crystals', 'breathwork', 'mindfulness',
      'nature-connection', 'rituals', 'ceremonies', 'other'
    ]
  },
  lifePurpose: {
    type: String,
    maxlength: 500
  },
  healingStage: {
    type: String,
    enum: ['beginning', 'in-progress', 'advanced', 'maintaining'],
    default: 'beginning'
  },
  // Relationship Intent
  relationshipIntention: {
    type: String,
    enum: [
      'conscious-partnership',
      'marriage-oriented',
      'spiritual-friendship',
      'healing-companion',
      'exploring',
      'not-sure'
    ],
    required: true
  },
  intentBadges: {
    type: [String],
    enum: [
      'conscious-partnership',
      'marriage-oriented',
      'spiritual-friendship',
      'healing-companion'
    ]
  },
  // Lifestyle
  lifestyleChoices: {
    type: [String],
    enum: [
      'vegetarian', 'vegan', 'organic', 'minimalist', 'eco-conscious',
      'digital-detox', 'early-riser', 'night-owl', 'traveler', 'homebody'
    ]
  },
  activityLevel: {
    type: String,
    enum: ['very-active', 'active', 'moderate', 'low', 'varies'],
    default: 'moderate'
  },
  // Profile Content
  bio: {
    type: String,
    maxlength: 2000
  },
  photos: [{
    url: String,
    isPrimary: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: Date.now }
  }],
  // Profile Status
  isComplete: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String
  },
  // Visibility & Engagement
  visibility: {
    type: String,
    enum: ['public', 'limited', 'hidden'],
    default: 'limited'
  },
  profileViews: {
    type: Number,
    default: 0
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  // Spiritual Readiness Score (calculated)
  spiritualReadinessScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Indexes for faster queries (unique index)
profileSchema.index({ user: 1 }, { unique: true });
profileSchema.index({ 'location.coordinates.latitude': 1, 'location.coordinates.longitude': 1 });
profileSchema.index({ isApproved: 1, isComplete: 1 });
profileSchema.index({ age: 1 });
profileSchema.index({ lastActive: -1 });

const Profile = mongoose.model('Profile', profileSchema);

export default Profile;

