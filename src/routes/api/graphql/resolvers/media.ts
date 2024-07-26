// System Logs
import { logger } from '@src/utils/logger';

import { dbAdapter } from '@api/databases/db';

export function mediaTypeDefs() {
	return `
        type MediaImage {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaDocument {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaAudio {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaVideo {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaRemote {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }
    `;
}

export function mediaResolvers() {
	return {
		mediaImages: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_images', {});
			logger.info('Fetched media images', { count: result.length });
			return result;
		},
		mediaDocuments: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_documents', {});
			logger.info('Fetched media documents', { count: result.length });
			return result;
		},
		mediaAudio: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_audio', {});
			logger.info('Fetched media audio', { count: result.length });
			return result;
		},
		mediaVideos: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_videos', {});
			logger.info('Fetched media videos', { count: result.length });
			return result;
		},
		mediaRemote: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_remote', {});
			logger.info('Fetched media remote', { count: result.length });
			return result;
		}
	};
}
