import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { deleteFile } from '@utils/media/mediaStorage';
import { logger } from '@utils/logger';

export const DELETE: RequestHandler = async ({ request, cookies }) => {
    const session_id = cookies.get(SESSION_COOKIE_NAME);
    if (!session_id) {
        logger.warn('No session ID found during file deletion');
        throw error(401, 'Unauthorized');
    }

    if (!auth) {
        logger.error('Auth service is not initialized');
        throw error(500, 'Auth service not available');
    }

    try {
        const user = await auth.validateSession({ session_id });
        if (!user) {
            logger.warn('Invalid session during file deletion');
            throw error(401, 'Unauthorized');
        }

        const { url } = await request.json();
        if (!url) {
            throw error(400, 'URL is required');
        }

        await deleteFile(url);

        return json({ success: true });
    } catch (err) {
        const message = `Error deleting file: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
};
