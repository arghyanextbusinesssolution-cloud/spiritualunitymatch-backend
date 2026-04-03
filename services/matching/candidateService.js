import Profile from '../../models/Profile.js';
import Match from '../../models/Match.js';
import RejectedUser from '../../models/RejectedUser.js';

/**
 * Service to fetch potential match candidates from the database.
 * Filters out already interacted users (likes, matches, rejections).
 * Applies baseline filters like age and gender preference to reduce the pool.
 */
export async function getCandidates(userIdStr, userProfile, limit = 100) {
    // 1. Get existing interactions to exclude
    const existingMatches = await Match.find({
        $or: [{ user1: userIdStr }, { user2: userIdStr }]
    });

    const excludedUserIds = [];
    for (const match of existingMatches) {
        const isUser1 = match.user1.toString() === userIdStr;
        const otherUserId = isUser1 ? match.user2 : match.user1;

        if (match.isMatch) {
            // Mutual match
            excludedUserIds.push(otherUserId);
        } else if (isUser1 && match.user1Liked && !match.user2Liked) {
            // User liked them, they haven't liked back
            excludedUserIds.push(otherUserId);
        } else if (!isUser1 && match.user2Liked && !match.user1Liked) {
            // User liked them, they haven't liked back
            excludedUserIds.push(otherUserId);
        }
    }
    excludedUserIds.push(userIdStr); // Exclude self

    // 2. Exclude rejected users
    const now = new Date();
    const activeRejections = await RejectedUser.find({
        user: userIdStr,
        expiresAt: { $gt: now },
        isActive: true
    });

    for (const rejection of activeRejections) {
        const rejectedUserId = rejection.rejectedUser.toString();
        if (!excludedUserIds.includes(rejectedUserId)) {
            excludedUserIds.push(rejectedUserId);
        }
    }

    // 3. Build query for potential candidates
    const query = {
        user: { $nin: excludedUserIds },
        isComplete: true
    };

    // Only require approval in production (unless explicitly set)
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_UNAPPROVED_MATCHES !== 'true') {
        query.isApproved = true;
    }

    // Baseline filtering: Gender preference
    if (userProfile.genderPreference && !userProfile.genderPreference.includes('all')) {
        query.gender = { $in: userProfile.genderPreference };
    }

    // Baseline filtering: Age range
    if (userProfile.ageRange) {
        query.age = {
            $gte: userProfile.ageRange.min,
            $lte: userProfile.ageRange.max
        };
    }

    // 4. Fetch the initial candidate pool (larger than requested limit to allow for scoring/ranking)
    const candidatePoolSize = limit * 3; // Fetch 3x to find the best among them
    const candidates = await Profile.find(query)
        .populate('user', 'email')
        .limit(candidatePoolSize)
        .lean(); // Use lean() for faster reads memory performance

    return candidates;
}
