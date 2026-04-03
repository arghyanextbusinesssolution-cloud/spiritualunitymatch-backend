import User from '../../models/User.js';
import { generateMatchesForUser } from '../matching/rankingService.js';
import { cacheMatches } from '../matching/matchCacheService.js';

/**
 * Background Job to Pre-generate Matches
 * 
 * This job iterates over active users and pre-computes their top matches,
 * saving the results into MatchCache. This allows the /suggested endpoint
 * to return matches instantly (in milliseconds) without running heavy loops.
 */
export async function runGenerateMatchesJob() {
    console.log('[JOB START] Generating matches for all users...');
    try {
        // 1. Find all active/complete users
        // For a 100k user base, this needs pagination/batching in the future.
        // For now, we fetch a batch of recently active users.
        const activeUsers = await User.find({ status: 'active' }).limit(1000).select('_id');

        let processed = 0;

        for (const user of activeUsers) {
            const userIdStr = user._id.toString();

            try {
                console.log(`[JOB] Generating matches for user ${userIdStr}...`);
                // Generate top 100 matches
                const matches = await generateMatchesForUser(userIdStr, 100);

                // Cache them
                if (matches && matches.length > 0) {
                    await cacheMatches(userIdStr, matches);
                    processed++;
                }
            } catch (err) {
                console.error(`[JOB ERROR] Failed to generate matches for ${userIdStr}:`, err);
                // Continue with next user
            }
        }

        console.log(`[JOB END] Successfully generated and cached matches for ${processed} users.`);
    } catch (error) {
        console.error('[JOB FATAL] Error running match generation job:', error);
    }
}

// Optional: you can export a cron scheduler here if you use node-cron
// import cron from 'node-cron';
// cron.schedule('0 3 * * *', runGenerateMatchesJob); // Run at 3 AM daily
