import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { saveRemoteMedia } from '@utils/media/mediaStorage';
import { logger } from '@utils/logger';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const session_id = cookies.get(SESSION_COOKIE_NAME);
    if (!session_id) {
        logger.warn('No session ID found during remote media save');
        throw error(401, 'Unauthorized');
    }

    if (!auth) {
        logger.error('Auth service is not initialized');
        throw error(500, 'Auth service not available');
    }

    try {
        const user = await auth.validateSession({ session_id });
        if (!user) {
            logger.warn('Invalid session during remote media save');
            throw error(401, 'Unauthorized');
        }

        const { fileUrl, collectionTypes } = await request.json();
        if (!fileUrl || !collectionTypes) {
            throw error(400, 'File URL and collection types are required');
        }

        const result = await saveRemoteMedia(fileUrl, collectionTypes, user._id.toString());
        return json({ success: true, ...result });
    } catch (err) {
        const message = `Error saving remote media: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
};
