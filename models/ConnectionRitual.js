import mongoose from 'mongoose';

const connectionRitualSchema = new mongoose.Schema({
  match: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  day: {
    type: Number,
    min: 1,
    max: 7,
    required: true
  },
  prompt: {
    type: String,
    required: true
  },
  user1Response: {
    type: String,
    maxlength: 2000
  },
  user2Response: {
    type: String,
    maxlength: 2000
  },
  sharedIntentions: [{
    type: String
  }],
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: Date
}, {
  timestamps: true
});

// Index to ensure one ritual per match per day
connectionRitualSchema.index({ match: 1, day: 1 }, { unique: true });

const ConnectionRitual = mongoose.model('ConnectionRitual', connectionRitualSchema);

export default ConnectionRitual;