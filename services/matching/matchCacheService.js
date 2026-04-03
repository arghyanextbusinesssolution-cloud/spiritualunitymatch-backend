import MatchCache from '../../models/MatchCache.js';

/**
 * Service to store and retrieve pre-generated matches for rapid access.
 */

export async function getCachedMatches(userIdStr) {
    try {
        const cache = await MatchCache.findOne({ user: userIdStr }).populate('matches.profile');
        if (cache && cache.matches && cache.matches.length > 0) {
            // Rehydrate payload to look exactly like the old /api/matches/suggested response
            return cache.matches.map(m => ({
                ...m.toObject(),
                profile: {
                    ...m.profile.toObject(),
                    user: { _id: m.userId, email: m.profile.user?.email } // Dummy hydration since email isn't cached deeply, usually enough.
                }
            }));
        }
        return null;
    } catch (error) {
        console.error('Error fetching cached matches:', error);
        return null;
    }
}

export async function cacheMatches(userIdStr, scoredMatches) {
    try {
        // Expiration date - e.g. cache expires in 24 hours
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Filter out hydrated arrays to store lean objects
        const matchesToCache = scoredMatches.map(m => {
            const { populatedProfile, ...storeableMatch } = m;
            return storeableMatch;
        });

        const cacheDoc = await MatchCache.findOneAndUpdate(
            { user: userIdStr },
            {
                user: userIdStr,
                matches: matchesToCache,
                expiresAt,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        return cacheDoc;
    } catch (error) {
        console.error('Error caching matches:', error);
        throw error;
    }
}

export async function removeMatchFromCache(userIdStr, targetUserIdStr) {
    try {
        await MatchCache.updateOne(
            { user: userIdStr },
            { $pull: { matches: { userId: targetUserIdStr } } }
        );
    } catch (error) {
        console.error('Error removing match from cache:', error);
    }
}
