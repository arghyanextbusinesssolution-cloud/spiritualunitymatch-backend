import mongoose from 'mongoose';

const matchCacheSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    matches: [{
        userId: { type: String, required: true },
        profile: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
        matchScore: { type: Number, required: true },
        matchLabels: [{ type: String }],
        compatibility: {
            spiritual: { type: Number },
            lifestyle: { type: Number },
            intent: { type: Number },
            values: { type: Number }
        },
        genderPreference: { type: String },
        commonInterests: {
            beliefs: [{ type: String }],
            practices: [{ type: String }],
            lifestyle: [{ type: String }]
        },
        matchExplanation: { type: String }
    }],
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // Document auto-deletes when current date >= expiresAt
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Create compound index for fast queries
matchCacheSchema.index({ user: 1 });

const MatchCache = mongoose.model('MatchCache', matchCacheSchema);

export default MatchCache;
