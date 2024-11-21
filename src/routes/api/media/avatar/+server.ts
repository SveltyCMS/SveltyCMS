import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { saveAvatarImage } from '@utils/media/mediaStorage';
import { logger } from '@utils/logger';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const session_id = cookies.get(SESSION_COOKIE_NAME);
    if (!session_id) {
        logger.warn('No session ID found during avatar upload');
        throw error(401, 'Unauthorized');
    }

    if (!auth) {
        logger.error('Auth service is not initialized');
        throw error(500, 'Auth service not available');
    }

    try {
        const user = await auth.validateSession({ session_id });
        if (!user) {
            logger.warn('Invalid session during avatar upload');
            throw error(401, 'Unauthorized');
        }

        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file || !(file instanceof File)) {
            throw error(400, 'Valid file is required');
        }

        const avatarUrl = await saveAvatarImage(file);
        return json({ success: true, url: avatarUrl });
    } catch (err) {
        const message = `Error saving avatar image: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
};
