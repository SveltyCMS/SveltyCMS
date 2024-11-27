import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { getFile } from '@utils/media/mediaStorage';
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ url, cookies }) => {
    const session_id = cookies.get(SESSION_COOKIE_NAME);
    if (!session_id) {
        logger.warn('No session ID found during file retrieval');
        throw error(401, 'Unauthorized');
    }

    if (!auth) {
        logger.error('Auth service is not initialized');
        throw error(500, 'Auth service not available');
    }

    try {
        const user = await auth.validateSession({ session_id });
        if (!user) {
            logger.warn('Invalid session during file retrieval');
            throw error(401, 'Unauthorized');
        }

        const fileUrl = url.searchParams.get('url');
        if (!fileUrl) {
            throw error(400, 'URL parameter is required');
        }

        const buffer = await getFile(fileUrl);
        
        return new Response(buffer, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${fileUrl.split('/').pop()}"`,
                'Content-Length': buffer.length.toString()
            }
        });
    } catch (err) {
        const message = `Error retrieving file: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
};
