import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ['basic', 'standard', 'premium'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'canceled', 'expired', 'past_due'],
    default: 'active'
  },
  // Stripe Information
  stripeCustomerId: {
    type: String
  },
  stripeSubscriptionId: {
    type: String
  },
  stripePriceId: {
    type: String
  },
  // Subscription Period
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  // Cancellation
  canceledAt: {
    type: Date
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  // Features unlocked (for quick access)
  features: {
    unlimitedBrowsing: { type: Boolean, default: false },
    messaging: { type: Boolean, default: false },
    seeLikes: { type: Boolean, default: false },
    advancedFilters: { type: Boolean, default: false },
    profileBoost: { type: Boolean, default: false },
    priorityPlacement: { type: Boolean, default: false },
    seeProfileViews: { type: Boolean, default: false },
    matchInsights: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Indexes
subscriptionSchema.index({ user: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && (!this.endDate || this.endDate > new Date());
};

// Method to update features based on plan
subscriptionSchema.methods.updateFeatures = function() {
  // Reset all features
  this.features = {
    unlimitedBrowsing: false,
    messaging: false,
    seeLikes: false,
    advancedFilters: false,
    profileBoost: false,
    priorityPlacement: false,
    seeProfileViews: false,
    matchInsights: false
  };

  // Basic plan features
  if (this.plan === 'basic') {
    this.features.unlimitedBrowsing = false; // Limited browsing
  }

  // Standard plan features
  if (this.plan === 'standard') {
    this.features.unlimitedBrowsing = true;
    this.features.messaging = true;
    this.features.seeLikes = true;
  }

  // Premium plan features
  if (this.plan === 'premium') {
    this.features.unlimitedBrowsing = true;
    this.features.messaging = true;
    this.features.seeLikes = true;
    this.features.advancedFilters = true;
    this.features.profileBoost = true;
    this.features.priorityPlacement = true;
    this.features.seeProfileViews = true;
    this.features.matchInsights = true;
  }
};

// Auto-update features before saving
subscriptionSchema.pre('save', function(next) {
  if (this.isModified('plan')) {
    this.updateFeatures();
  }
  next();
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;

