import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  image: { type: String },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  location: { type: String },
  capacity: { type: Number },
  visibleToPlans: [{ type: String }], // e.g. ['basic','standard','premium']
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

eventSchema.index({ startDate: 1 });

const Event = mongoose.model('Event', eventSchema);
export default Event;
