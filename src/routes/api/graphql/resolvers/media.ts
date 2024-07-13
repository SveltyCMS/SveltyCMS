import { dbAdapter } from '@api/databases/db';

export function mediaTypeDefs() {
	return `
        type MediaImage {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaDocument {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaAudio {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaVideo {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaRemote {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }
    `;
}

export function mediaResolvers() {
	return {
		mediaImages: async () => {
			if (!dbAdapter) {
				throw new Error('Database adapter is not initialized');
			}
			return await dbAdapter.findMany('media_images', {});
		},
		mediaDocuments: async () => {
			if (!dbAdapter) {
				throw new Error('Database adapter is not initialized');
			}
			return await dbAdapter.findMany('media_documents', {});
		},
		mediaAudio: async () => {
			if (!dbAdapter) {
				throw new Error('Database adapter is not initialized');
			}
			return await dbAdapter.findMany('media_audio', {});
		},
		mediaVideos: async () => {
			if (!dbAdapter) {
				throw new Error('Database adapter is not initialized');
			}
			return await dbAdapter.findMany('media_videos', {});
		},
		mediaRemote: async () => {
			if (!dbAdapter) {
				throw new Error('Database adapter is not initialized');
			}
			return await dbAdapter.findMany('media_remote', {});
		}
	};
}
