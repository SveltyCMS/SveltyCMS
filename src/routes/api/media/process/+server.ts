import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { auth, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Media Processing
import { extractMetadata } from '@utils/media/mediaProcessing';
import { MediaService } from '@utils/media/MediaService';
import type {  MediaAccess } from '@utils/media/mediaModels';
import { Permission } from '@utils/media/mediaModels';

// System Logger
import { logger } from '@utils/logger.svelte';

// Helper function to get MediaService instance
function getMediaService(): MediaService {
    if (!dbAdapter) {
        throw new Error('Database adapter is not initialized');
    }
    try {
        const service = new MediaService(dbAdapter);
        logger.info('MediaService initialized successfully');
        return service;
    } catch (err) {
        const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw new Error(message);
    }
}

export const POST: RequestHandler = async ({ request, cookies }) => {
    const session_id = cookies.get(SESSION_COOKIE_NAME);
    if (!session_id) {
        logger.warn('No session ID found during media processing');
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth) {
        logger.error('Auth service is not initialized');
        return json({ success: false, error: 'Auth service not available' }, { status: 500 });
    }

    try {
        const user = await auth.validateSession({ session_id });
        if (!user) {
            logger.warn('Invalid session during media processing');
            return json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const processType = formData.get('processType');

        if (!file || !(file instanceof File)) {
            logger.warn('No valid file received for processing');
            return json({ success: false, error: 'No valid file received' }, { status: 400 });
        }

        if (!processType || typeof processType !== 'string') {
            logger.warn('No process type specified');
            return json({ success: false, error: 'Process type not specified' }, { status: 400 });
        }

        // Initialize MediaService
        const mediaService = getMediaService();

        let result: any;
        switch (processType) {
            case 'metadata':
                result = await extractMetadata(file);
                break;
            case 'save': {
                const access: MediaAccess = {
                    userId: user._id.toString(),
                    permissions: [Permission.Read, Permission.Write]
                };
                result = await mediaService.saveMedia(file, user._id.toString(), access);
                break;
            }
            default:
                throw error(400, `Unsupported process type: ${processType}`);
        }

        return json({
            success: true,
            data: result
        });

    } catch (err) {
        const message = `Error processing media: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        return json({ success: false, error: message }, { status: 500 });
    }
}
