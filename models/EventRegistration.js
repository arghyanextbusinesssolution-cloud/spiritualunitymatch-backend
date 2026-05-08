import mongoose from 'mongoose';

const eventRegistrationSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'free'], 
    default: 'free' 
  },
  stripeSessionId: { type: String },
  createdAt: { type: Date, default: Date.now }
});

eventRegistrationSchema.index({ event: 1, user: 1 }, { unique: true });

const EventRegistration = mongoose.model('EventRegistration', eventRegistrationSchema);
export default EventRegistration;
