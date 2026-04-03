import mongoose from 'mongoose';

// Admin actions log for audit trail
const adminActionSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: [
      'user_deleted',
      'user_suspended',
      'user_unsuspended',
      'profile_approved',
      'profile_rejected',
      'subscription_modified',
      'content_moderated',
      'system_config_changed'
    ],
    required: true
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  details: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
adminActionSchema.index({ admin: 1, createdAt: -1 });
adminActionSchema.index({ targetUser: 1 });
adminActionSchema.index({ action: 1 });

const AdminAction = mongoose.model('AdminAction', adminActionSchema);

export default AdminAction;

