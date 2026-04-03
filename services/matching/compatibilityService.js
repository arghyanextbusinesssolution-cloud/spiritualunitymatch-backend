import { calculateGenderScore, calculateAgeScore, calculateDistanceScore } from '../../utils/scoreUtils.js';

/**
 * Quickly filters down the candidate pool in-memory before running the heavy
 * full compatibility scoring logic. Guaranteed dealbreakers are removed here.
 */
export function preFilter(userProfile, candidates) {
    return candidates.filter(candidateProfile => {
        // 1. Strict Gender Check (Already partially done in DB, but double-checking custom logic)
        const genderScore = calculateGenderScore(userProfile, candidateProfile);
        if (genderScore === 0) return false;

        // 2. Strict Distance Check
        // If distance score is strictly 0 (exceeds max distance), filter them out.
        // calculateDistanceScore returns 0 if distance > maxDist
        const distanceScore = calculateDistanceScore(userProfile, candidateProfile);
        if (distanceScore === 0) return false;

        // 3. Strict Age Check
        // If age score is 0, they are out of each other's preferred ranges
        const ageScore = calculateAgeScore(userProfile, candidateProfile);
        if (ageScore === 0) return false;

        return true;
    });
}
