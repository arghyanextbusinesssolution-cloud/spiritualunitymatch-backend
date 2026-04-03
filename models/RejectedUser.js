import mongoose from 'mongoose';

const rejectedUserSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  rejectedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  rejectedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  // Whether the rejection is still active (not expired)
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index to ensure one rejection per user pair and fast lookups
rejectedUserSchema.index({ user: 1, rejectedUser: 1 }, { unique: true });
rejectedUserSchema.index({ expiresAt: 1 });

// Method to check if rejection is still active
rejectedUserSchema.methods.isStillActive = function() {
  return this.isActive && new Date() < this.expiresAt;
};

const RejectedUser = mongoose.model('RejectedUser', rejectedUserSchema);

export default RejectedUser;
