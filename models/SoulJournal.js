import mongoose from 'mongoose';

const soulJournalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000
  },
  type: {
    type: String,
    enum: ['free-write', 'prompt', 'gratitude', 'relationship-lesson'],
    default: 'free-write'
  },
  prompt: {
    type: String
  },
  tags: [{
    type: String
  }],
  isGratitude: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for user journal entries
soulJournalSchema.index({ user: 1, createdAt: -1 });

const SoulJournal = mongoose.model('SoulJournal', soulJournalSchema);

export default SoulJournal;