import { calculateDistance } from './geoUtils.js';

// Calculate age compatibility score
export function calculateAgeScore(profile1, profile2) {
    const age1 = profile1.age;
    const age2 = profile2.age;

    const inRange1 = age2 >= profile1.ageRange.min && age2 <= profile1.ageRange.max;
    const inRange2 = age1 >= profile2.ageRange.min && age1 <= profile2.ageRange.max;

    if (!inRange1 || !inRange2) return 0;

    const ageDiff = Math.abs(age1 - age2);
    if (ageDiff === 0) return 100;
    if (ageDiff <= 2) return 90;
    if (ageDiff <= 5) return 75;
    if (ageDiff <= 10) return 60;
    return 40;
}

// Calculate gender preference compatibility
export function calculateGenderScore(profile1, profile2) {
    const pref1 = profile1.genderPreference || ['all'];
    const pref2 = profile2.genderPreference || ['all'];

    if (pref1.includes('all') || pref2.includes('all')) return 100;

    const match1 = pref1.includes(profile2.gender);
    const match2 = pref2.includes(profile1.gender);

    if (match1 && match2) return 100;
    if (match1 || match2) return 50;
    return 0;
}

// Calculate distance score
export function calculateDistanceScore(profile1, profile2) {
    const coords1 = profile1.location?.coordinates;
    const coords2 = profile2.location?.coordinates;

    if (!coords1 || !coords2) return 50;

    const distance = calculateDistance(
        coords1.latitude,
        coords1.longitude,
        coords2.latitude,
        coords2.longitude
    );

    const maxDist1 = profile1.maxDistance || 50;
    const maxDist2 = profile2.maxDistance || 50;
    const maxDist = Math.min(maxDist1, maxDist2);

    if (distance > maxDist) return 0;

    if (distance <= 5) return 100;
    if (distance <= 10) return 90;
    if (distance <= 25) return 75;
    if (distance <= 50) return 60;
    return 40;
}

// Calculate spiritual alignment score
export function calculateSpiritualScore(profile1, profile2) {
    let score = 0;
    let factors = 0;

    const beliefs1 = profile1.spiritualBeliefs || [];
    const beliefs2 = profile2.spiritualBeliefs || [];
    if (beliefs1.length > 0 && beliefs2.length > 0) {
        const commonBeliefs = beliefs1.filter(b => beliefs2.includes(b));
        if (commonBeliefs.length > 0) {
            score += (commonBeliefs.length / Math.max(beliefs1.length, beliefs2.length)) * 100;
        }
        factors++;
    }

    const practices1 = profile1.spiritualPractices || [];
    const practices2 = profile2.spiritualPractices || [];
    if (practices1.length > 0 && practices2.length > 0) {
        const commonPractices = practices1.filter(p => practices2.includes(p));
        if (commonPractices.length > 0) {
            score += (commonPractices.length / Math.max(practices1.length, practices2.length)) * 100;
        }
        factors++;
    }

    if (profile1.healingStage && profile2.healingStage) {
        if (profile1.healingStage === profile2.healingStage) {
            score += 100;
        } else {
            const stages = ['beginning', 'in-progress', 'advanced', 'maintaining'];
            const idx1 = stages.indexOf(profile1.healingStage);
            const idx2 = stages.indexOf(profile2.healingStage);
            const diff = Math.abs(idx1 - idx2);
            score += (1 - diff / 3) * 100;
        }
        factors++;
    }

    return factors > 0 ? score / factors : 50;
}

// Calculate lifestyle compatibility
export function calculateLifestyleScore(profile1, profile2) {
    let score = 50;

    const lifestyle1 = profile1.lifestyleChoices || [];
    const lifestyle2 = profile2.lifestyleChoices || [];

    if (lifestyle1.length > 0 && lifestyle2.length > 0) {
        const common = lifestyle1.filter(l => lifestyle2.includes(l));
        const total = new Set([...lifestyle1, ...lifestyle2]).size;
        score = (common.length / total) * 100;
    }

    if (profile1.activityLevel && profile2.activityLevel) {
        if (profile1.activityLevel === profile2.activityLevel) {
            score += 20;
        }
    }

    return Math.min(score, 100);
}

// Calculate relationship intent compatibility
export function calculateIntentScore(profile1, profile2) {
    const intent1 = profile1.relationshipIntention;
    const intent2 = profile2.relationshipIntention;

    if (!intent1 || !intent2) return 50;

    if (intent1 === intent2) return 100;

    const compatiblePairs = [
        ['conscious-partnership', 'marriage-oriented'],
        ['spiritual-friendship', 'healing-companion'],
        ['exploring', 'not-sure']
    ];

    for (const pair of compatiblePairs) {
        if ((pair.includes(intent1) && pair.includes(intent2))) {
            return 75;
        }
    }

    const badges1 = profile1.intentBadges || [];
    const badges2 = profile2.intentBadges || [];
    if (badges1.length > 0 && badges2.length > 0) {
        const commonBadges = badges1.filter(b => badges2.includes(b));
        if (commonBadges.length > 0) return 80;
    }

    return 40;
}

// Generate match explanation text
export function generateMatchExplanation(score, labels, breakdown) {
    const explanations = [];

    if (score >= 85) {
        explanations.push('Exceptional spiritual alignment');
    } else if (score >= 70) {
        explanations.push('Strong spiritual connection');
    } else if (score >= 55) {
        explanations.push('Good compatibility potential');
    }

    if (breakdown.spiritual >= 80) {
        explanations.push('Deep spiritual resonance');
    }
    if (breakdown.intent >= 80) {
        explanations.push('Aligned relationship goals');
    }
    if (breakdown.lifestyle >= 75) {
        explanations.push('Compatible lifestyle choices');
    }

    if (labels.includes('aligned-in-spiritual-rhythm')) {
        explanations.push('Shared spiritual practices');
    }
    if (labels.includes('aligned-in-purpose')) {
        explanations.push('Similar life purpose');
    }

    return explanations.length > 0
        ? explanations.join(' • ')
        : 'Potential connection based on compatibility';
}
