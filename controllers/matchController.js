import Match from '../models/Match.js';
import Profile from '../models/Profile.js';
import Engagement from '../models/Engagement.js';
import Notification from '../models/Notification.js';
import Subscription from '../models/Subscription.js';
import RejectedUser from '../models/RejectedUser.js';
import mongoose from 'mongoose';
import { getCachedMatches, cacheMatches, removeMatchFromCache } from '../services/matching/matchCacheService.js';
import { generateMatchesForUser } from '../services/matching/rankingService.js';
import { calculateScore } from '../services/matching/scoringService.js';

/**
 * Controller handling Match business logic.
 */

// @desc    Get suggested matches for the logged-in user
export const getSuggestedMatches = async (req, res) => {
    try {
        const userId = req.user._id;
        const userIdStr = userId.toString();
        const { 
            limit = 20,
            minAge,
            maxAge,
            maxDistance,
            spiritualInterests, // comma-separated string
            sortByDistance
        } = req.query;

        const hasFilters = minAge || maxAge || maxDistance || spiritualInterests || sortByDistance;

        // 1. Check match cache first (skip cache if filters active)
        let cachedMatches = !hasFilters ? await getCachedMatches(userIdStr) : null;

        let allMatches = [];

        if (cachedMatches && cachedMatches.length > 0) {
            console.log(`✅ [BACKEND] CACHE HIT: Found ${cachedMatches.length} suggested matches for user ${userIdStr}`);
            allMatches = cachedMatches;
        } else {
            // 2. Cache Miss: Generate instantly
            console.log(`⚠️ [BACKEND] CACHE MISS: Generating matches on-the-fly for user ${userIdStr}`);
            const generatedMatches = await generateMatchesForUser(userIdStr, 100);

            if (generatedMatches.length > 0) {
                if (!hasFilters) {
                    cacheMatches(userIdStr, generatedMatches).catch(err => console.error("Cache save error:", err));
                }
                allMatches = generatedMatches.map(m => {
                    const { populatedProfile, ...clientMatch } = m;
                    return { ...clientMatch, profile: populatedProfile };
                });
            }
        }

        // 3. Apply filters in-memory
        let filteredMatches = allMatches;

        if (minAge) {
            const min = parseInt(minAge);
            filteredMatches = filteredMatches.filter(m => (m.profile?.age || m.profile?.age === 0) && m.profile.age >= min);
        }
        if (maxAge) {
            const max = parseInt(maxAge);
            filteredMatches = filteredMatches.filter(m => (m.profile?.age || m.profile?.age === 0) && m.profile.age <= max);
        }

        // Distance filter & sorting: uses haversine formula if coordinates exist
        if ((maxDistance || sortByDistance === 'true') && req.user) {
            const userProfile = await Profile.findOne({ user: userId })
                .select('location')
                .lean();

            if (userProfile?.location?.coordinates?.latitude) {
                const { latitude: lat1, longitude: lon1 } = userProfile.location.coordinates;
                const R = 6371; // km

                filteredMatches = filteredMatches.map(m => {
                    const coords = m.profile?.location?.coordinates;
                    if (!coords?.latitude) return { ...m, computedDistance: Infinity }; // Keep at end
                    const lat2 = coords.latitude;
                    const lon2 = coords.longitude;
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a =
                        Math.sin(dLat / 2) ** 2 +
                        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                        Math.sin(dLon / 2) ** 2;
                    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    return { ...m, computedDistance: dist };
                });

                if (maxDistance) {
                    const maxDist = parseFloat(maxDistance);
                    filteredMatches = filteredMatches.filter(m => m.computedDistance <= maxDist);
                }

                if (sortByDistance === 'true') {
                    filteredMatches.sort((a, b) => a.computedDistance - b.computedDistance);
                }
            }
        }

        if (spiritualInterests) {
            const interests = spiritualInterests.split(',').map(s => s.trim().toLowerCase());
            filteredMatches = filteredMatches.filter(m => {
                const beliefs = (m.profile?.spiritualBeliefs || []).map((b) => b.toLowerCase());
                const practices = (m.profile?.spiritualPractices || []).map((p) => p.toLowerCase());
                return interests.some(i => beliefs.includes(i) || practices.includes(i));
            });
        }

        return res.json({
            success: true,
            matches: filteredMatches.slice(0, parseInt(limit))
        });
    } catch (error) {
        console.error('Get suggested matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching suggested matches'
        });
    }
};

// @desc    Like a user
export const likeUser = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User ID not found' });
        }

        const userIdStr = userId.toString ? userId.toString() : String(userId);
        let likedUserId = String(req.params.userId);

        if (likedUserId.includes('ObjectId(') || likedUserId.includes('_id:')) {
            const objectIdMatch = likedUserId.match(/ObjectId\(['"]([^'"]+)['"]\)/);
            if (objectIdMatch && objectIdMatch[1]) likedUserId = objectIdMatch[1];
            else {
                const idMatch = likedUserId.match(/([0-9a-fA-F]{24})/);
                if (idMatch && idMatch[1]) likedUserId = idMatch[1];
            }
        }

        if (userIdStr === likedUserId) {
            return res.status(400).json({ success: false, message: 'Cannot like yourself' });
        }

        let engagement = await Engagement.findOne({ user: userIdStr });
        if (!engagement) engagement = new Engagement({ user: userIdStr });

        engagement.resetDailyLimits();

        const subscription = req.subscription;
        // Sync limits with current plan
        engagement.syncLimitsWithPlan(subscription.plan);

        // Enforce total swipe limits for non-premium plans
        if (subscription.plan !== 'premium') {
            if (engagement.dailySwipesUsed >= engagement.dailySwipesLimit) {
                return res.status(403).json({
                    success: false,
                    message: `Daily limit of ${engagement.dailySwipesLimit} swipes reached. Upgrade your plan for unlimited swipes.`,
                    requiresUpgrade: true,
                    limit: engagement.dailySwipesLimit
                });
            }
        }

        // Create or update match
        const sortedId1Str = [userIdStr, likedUserId].sort()[0];
        const sortedId2Str = [userIdStr, likedUserId].sort()[1];
        const id1 = new mongoose.Types.ObjectId(sortedId1Str);
        const id2 = new mongoose.Types.ObjectId(sortedId2Str);
        const isUser1First = userIdStr === sortedId1Str;

        let match = await Match.findOne({ user1: id1, user2: id2 });

        if (!match) {
            match = new Match({
                user1: id1,
                user2: id2,
                user1Liked: isUser1First ? true : false,
                user2Liked: isUser1First ? false : true
            });
        } else {
            if (isUser1First) match.user1Liked = true;
            else match.user2Liked = true;
        }

        // Mutual Match validation
        let isMutualMatch = false;
        if (match.user1Liked && match.user2Liked && !match.isMatch) {
            match.isMatch = true;
            match.matchedAt = new Date();
            isMutualMatch = true;

            // Score calc for mutual match using new scoring service
            const profile1 = await Profile.findOne({ user: match.user1 });
            const profile2 = await Profile.findOne({ user: match.user2 });
            if (profile1 && profile2) {
                const matchData = calculateScore(profile1, profile2);
                if (matchData) {
                    match.matchScore = matchData.score;
                    match.matchLabels = matchData.labels;
                    match.compatibility = matchData.breakdown;
                }
            }
        }
        await match.save();

        engagement.likesSent += 1;
        engagement.dailyLikesUsed += 1;
        engagement.dailySwipesUsed += 1;
        engagement.lastLike = new Date();
        engagement.calculateEngagementScore();
        await engagement.save();

        if (isMutualMatch) {
            await Notification.create([
                { user: userIdStr, type: 'new_match', title: 'New Match!', message: 'You have a new match!', relatedUser: likedUserId, relatedMatch: match._id, actionUrl: `/messages/${likedUserId}` },
                { user: likedUserId, type: 'new_match', title: 'New Match!', message: 'You have a new match!', relatedUser: userIdStr, relatedMatch: match._id, actionUrl: `/messages/${userIdStr}` }
            ]);
            const io = req.app.get('io');
            if (io) {
                io.to(`user:${userIdStr}`).emit('new_match', { matchId: match._id.toString(), userId: likedUserId, message: '🎉 It\'s a match!', actionUrl: `/messages/${likedUserId}` });
                io.to(`user:${likedUserId}`).emit('new_match', { matchId: match._id.toString(), userId: userIdStr, message: '🎉 It\'s a match!', actionUrl: `/messages/${userIdStr}` });
            }
        } else {
            await Notification.create({ user: likedUserId, type: 'new_like', title: 'Someone liked you', message: 'Someone liked your profile', relatedUser: userIdStr, actionUrl: `/matches/likes` });
            const io = req.app.get('io');
            if (io) io.to(`user:${likedUserId}`).emit('new_like', { userId: userIdStr, message: 'Someone liked your profile' });
        }

        // Remove from suggested matches cache
        await removeMatchFromCache(userIdStr, likedUserId);

        res.json({ success: true, match, isMutualMatch });
    } catch (error) {
        console.error('Like user error:', error);
        res.status(500).json({ success: false, message: 'Error liking user' });
    }
};

// @desc    Get user's matches (mutual likes)
export const getMyMatches = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const userIdStr = userId?.toString ? userId.toString() : String(userId);

        const matches = await Match.find({
            $or: [{ user1: userIdStr }, { user2: userIdStr }],
            isMatch: true
        }).populate('user1', 'email').populate('user2', 'email').sort({ matchedAt: -1 });

        const matchesWithProfiles = await Promise.all(
            matches.map(async (match) => {
                const otherUserId = match.user1.toString() === userIdStr ? match.user2 : match.user1;
                const profile = await Profile.findOne({ user: otherUserId });
                return {
                    matchId: match._id,
                    userId: otherUserId,
                    profile,
                    matchScore: match.matchScore,
                    matchLabels: match.matchLabels,
                    compatibility: match.compatibility,
                    matchedAt: match.matchedAt,
                    connectionRitualStarted: match.connectionRitualStarted,
                    connectionRitualDay: match.connectionRitualDay
                };
            })
        );

        res.json({ success: true, matches: matchesWithProfiles });
    } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({ success: false, message: 'Error fetching matches' });
    }
};

// @desc    Get users who liked current user
export const getLikes = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const userIdStr = userId?.toString ? userId.toString() : String(userId);
        const subscription = req.subscription;

        if (!subscription.features.seeLikes) {
            return res.status(403).json({ success: false, message: 'Standard or Premium plan required to see who liked you', requiresUpgrade: true });
        }

        const matches = await Match.find({
            $or: [
                { user1: userIdStr, user2Liked: true, user1Liked: false },
                { user2: userIdStr, user1Liked: true, user2Liked: false }
            ]
        }).populate('user1', 'email').populate('user2', 'email').sort({ createdAt: -1 });

        const likesWithProfiles = await Promise.all(
            matches.map(async (match) => {
                const user1Id = match.user1._id ? match.user1._id.toString() : match.user1.toString();
                const user2Id = match.user2._id ? match.user2._id.toString() : match.user2.toString();
                const otherUserId = user1Id === userIdStr ? user2Id : user1Id;
                const profile = await Profile.findOne({ user: otherUserId });

                return { userId: otherUserId, profile, likedAt: match.createdAt };
            })
        );

        res.json({ success: true, likes: likesWithProfiles });
    } catch (error) {
        console.error('Get likes error:', error);
        res.status(500).json({ success: false, message: 'Error fetching likes' });
    }
};

// @desc    Reject a user (hide for 7 days)
export const rejectUser = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const userIdStr = userId?.toString ? userId.toString() : String(userId);
        let rejectedUserId = String(req.params.userId);

        if (userIdStr === rejectedUserId) {
            return res.status(400).json({ success: false, message: 'Cannot reject yourself' });
        }

        let engagement = await Engagement.findOne({ user: userIdStr });
        if (!engagement) engagement = new Engagement({ user: userIdStr });

        engagement.resetDailyLimits();

        const subscription = req.subscription;
        // Sync limits with current plan
        engagement.syncLimitsWithPlan(subscription.plan);

        // Enforce total swipe limits for non-premium plans
        if (subscription.plan !== 'premium') {
            if (engagement.dailySwipesUsed >= engagement.dailySwipesLimit) {
                return res.status(403).json({
                    success: false,
                    message: `Daily limit of ${engagement.dailySwipesLimit} swipes reached. Upgrade your plan for unlimited swipes.`,
                    requiresUpgrade: true,
                    limit: engagement.dailySwipesLimit
                });
            }
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        let rejection = await RejectedUser.findOne({ user: userIdStr, rejectedUser: rejectedUserId });

        if (rejection) {
            rejection.rejectedAt = new Date();
            rejection.expiresAt = expiresAt;
            rejection.isActive = true;
        } else {
            rejection = new RejectedUser({
                user: userIdStr,
                rejectedUser: rejectedUserId,
                rejectedAt: new Date(),
                expiresAt: expiresAt,
                isActive: true
            });
        }

        await rejection.save();

        // Increment swipes
        engagement.dailySwipesUsed += 1;
        await engagement.save();

        // Remove from suggested matches cache
        await removeMatchFromCache(userIdStr, rejectedUserId);

        res.json({ success: true, message: 'User rejected. They will not appear in your matches for 7 days.', rejection });
    } catch (error) {
        console.error('Reject user error:', error);
        res.status(500).json({ success: false, message: 'Error rejecting user' });
    }
};
