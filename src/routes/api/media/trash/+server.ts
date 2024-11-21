import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { moveMediaToTrash } from '@utils/media/mediaStorage';
import { logger } from '@utils/logger';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const session_id = cookies.get(SESSION_COOKIE_NAME);
    if (!session_id) {
        logger.warn('No session ID found during file trash operation');
        throw error(401, 'Unauthorized');
    }

    if (!auth) {
        logger.error('Auth service is not initialized');
        throw error(500, 'Auth service not available');
    }

    try {
        const user = await auth.validateSession({ session_id });
        if (!user) {
            logger.warn('Invalid session during file trash operation');
            throw error(401, 'Unauthorized');
        }

        const { url, collectionTypes } = await request.json();
        if (!url || !collectionTypes) {
            throw error(400, 'URL and collection types are required');
        }

        await moveMediaToTrash(url, collectionTypes);
        return json({ success: true });
    } catch (err) {
        const message = `Error moving file to trash: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
};
