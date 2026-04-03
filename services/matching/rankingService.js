import { getCandidates } from './candidateService.js';
import { preFilter } from './compatibilityService.js';
import { calculateScore } from './scoringService.js';
import Profile from '../../models/Profile.js';
import mongoose from 'mongoose';

/**
 * Service to orchestrate the ranking and formatting of scored candidate matches.
 */

export function rankMatches(scoredMatches, limit = 20) {
    // Sort by match score (highest first)
    scoredMatches.sort((a, b) => b.matchScore - a.matchScore);

    // Take top limit
    const topMatches = scoredMatches.slice(0, limit);

    return topMatches;
}

export async function generateMatchesForUser(userIdStr, limit = 100) {
    const userProfile = await Profile.findOne({ user: userIdStr });
    if (!userProfile || !userProfile.isComplete) {
        return [];
    }

    // 1. Get raw candidate pool from DB
    const rawCandidates = await getCandidates(userIdStr, userProfile, limit);

    // 2. Pre-filter bad matches immediately in memory
    const filteredCandidates = preFilter(userProfile, rawCandidates);

    // 3. Score the remaining viable candidates
    const scoredMatches = [];

    for (const candidateProfile of filteredCandidates) {
        try {
            const matchData = calculateScore(userProfile, candidateProfile);

            if (matchData && matchData.score >= 40) { // Minimum threshold
                // Format common interests
                const commonBeliefs = (userProfile.spiritualBeliefs || []).filter(b =>
                    (candidateProfile.spiritualBeliefs || []).includes(b)
                );
                const commonPractices = (userProfile.spiritualPractices || []).filter(p =>
                    (candidateProfile.spiritualPractices || []).includes(p)
                );
                const commonLifestyle = (userProfile.lifestyleChoices || []).filter(l =>
                    (candidateProfile.lifestyleChoices || []).includes(l)
                );

                // Format gender preference
                const genderPreferenceDisplay = candidateProfile.genderPreference?.length === 1 && candidateProfile.genderPreference[0] === 'all'
                    ? 'All genders'
                    : candidateProfile.genderPreference?.map(g => {
                        const genderMap = {
                            'male': 'Men',
                            'female': 'Women',
                            'non-binary': 'Non-binary',
                            'all': 'All'
                        };
                        return genderMap[g] || g;
                    }).join(', ') || 'Not specified';

                scoredMatches.push({
                    userId: candidateProfile.user._id ? candidateProfile.user._id.toString() : candidateProfile.user.toString(),
                    profile: candidateProfile._id, // Save Reference ObjectId
                    populatedProfile: candidateProfile, // Keep hydrated object for now 
                    matchScore: matchData.score,
                    matchLabels: matchData.labels,
                    compatibility: matchData.breakdown,
                    genderPreference: genderPreferenceDisplay,
                    commonInterests: {
                        beliefs: commonBeliefs,
                        practices: commonPractices,
                        lifestyle: commonLifestyle
                    },
                    matchExplanation: matchData.explanation
                });
            }
        } catch (error) {
            console.error(`Error calculating score for candidate ${candidateProfile._id}:`, error);
        }
    }

    // 4. Rank and limit
    const topMatches = rankMatches(scoredMatches, limit);

    // We return the array ready to send to frontend or save to cache
    return topMatches;
}
