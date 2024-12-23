/**
 * @file src/routes/api/sync-content-structure/+server.ts
 * @description Defines a POST request handler to trigger the content structure synchronization process.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async () => {
    try {
        logger.info('Starting content structure synchronization process');

        // Call the syncContentStructure function from the MongoDB adapter
        await dbAdapter.syncContentStructure();

        logger.info('Content structure synchronization completed successfully');

        return json({
            success: true,
            message: 'Content structure synchronization completed successfully'
        });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Content structure synchronization failed', { error: errorMessage });
        throw error(500, errorMessage);
    }
};