import mongoose from 'mongoose';

const soulCheckInSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  emotion: {
    type: String,
    enum: ['calm', 'heavy', 'open', 'confused', 'hopeful'],
    required: true
  },
  need: {
    type: String,
    enum: ['connection', 'healing', 'clarity', 'growth', 'rest'],
    required: true
  },
  energy: {
    type: String,
    enum: ['low', 'balanced', 'high'],
    required: true
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Index to ensure one check-in per user per day
soulCheckInSchema.index({ user: 1, date: 1 }, { unique: false });

const SoulCheckIn = mongoose.model('SoulCheckIn', soulCheckInSchema);

export default SoulCheckIn;