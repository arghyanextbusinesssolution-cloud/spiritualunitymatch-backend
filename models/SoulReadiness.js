import mongoose from 'mongoose';

const soulReadinessSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  stage: {
    type: String,
    enum: ['knowing-self', 'healing-patterns', 'conscious-love', 'sacred-partnership'],
    default: 'knowing-self'
  },
  progress: {
    type: Map,
    of: {
      completed: { type: Boolean, default: false },
      answers: [String],
      completedAt: Date
    }
  },
  currentStageProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

const SoulReadiness = mongoose.model('SoulReadiness', soulReadinessSchema);

export default SoulReadiness;