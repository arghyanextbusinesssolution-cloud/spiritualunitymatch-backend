import {
    calculateAgeScore,
    calculateGenderScore,
    calculateDistanceScore,
    calculateSpiritualScore,
    calculateLifestyleScore,
    calculateIntentScore,
    generateMatchExplanation
} from '../../utils/scoreUtils.js';

/**
 * Service to calculate match scores entirely in-memory using pre-loaded profile objects.
 * This avoids expensive N+1 database queries compared to the old matching logic.
 */
export function calculateScore(profile1, profile2) {
    // Check if profiles are complete
    if (!profile1.isComplete || !profile2.isComplete) return null;

    // Calculate individual scores (each out of 100)
    const ageScore = calculateAgeScore(profile1, profile2);
    const genderScore = calculateGenderScore(profile1, profile2);
    const distanceScore = calculateDistanceScore(profile1, profile2);
    const spiritualScore = calculateSpiritualScore(profile1, profile2);
    const lifestyleScore = calculateLifestyleScore(profile1, profile2);
    const intentScore = calculateIntentScore(profile1, profile2);

    // If gender doesn't match, it's a dealbreaker
    if (genderScore === 0) {
        return null; // No match possible
    }

    // Weighted combination
    const weights = {
        age: 0.10,        // 10%
        gender: 0.15,     // 15%
        distance: 0.15,   // 15%
        spiritual: 0.30,  // 30% - MOST IMPORTANT
        lifestyle: 0.15,  // 15%
        intent: 0.15      // 15%
    };

    const totalScore =
        ageScore * weights.age +
        genderScore * weights.gender +
        distanceScore * weights.distance +
        spiritualScore * weights.spiritual +
        lifestyleScore * weights.lifestyle +
        intentScore * weights.intent;

    // Determine match labels (why they matched)
    const labels = [];
    if (spiritualScore >= 80) {
        labels.push('aligned-in-spiritual-rhythm');
    }
    if (intentScore >= 80 && (profile1.lifePurpose || profile2.lifePurpose)) {
        labels.push('aligned-in-purpose');
    }
    if (lifestyleScore >= 75) {
        labels.push('similar-lifestyle');
    }
    if (intentScore >= 75) {
        labels.push('compatible-intent');
    }
    if (spiritualScore >= 70 && lifestyleScore >= 70) {
        labels.push('spiritual-synergy');
    }

    const breakdown = {
        spiritual: Math.round(spiritualScore),
        lifestyle: Math.round(lifestyleScore),
        intent: Math.round(intentScore),
        values: Math.round((spiritualScore + lifestyleScore) / 2)
    };

    return {
        score: Math.round(totalScore),
        labels,
        breakdown,
        explanation: generateMatchExplanation(Math.round(totalScore), labels, breakdown)
    };
}
