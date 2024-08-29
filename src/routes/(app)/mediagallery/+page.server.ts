/**
 * @file src/routes/(app)/mediagallery/+page.server.ts
 * @description Server-side logic for the media gallery page.
 *
 * This module handles:
 * - User authentication and session validation
 * - Fetching media files from various collections (images, documents, audio, video)
 * - File upload processing for different media types
 * - Error handling and logging
 *
 * The load function prepares data for the media gallery, including user information
 * and a list of all media files. The actions object defines the server-side logic
 * for handling file uploads.
 */

import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { saveImage, saveDocument, saveAudio, saveVideo, constructUrl } from '@src/utils/media';

// Auth
import { auth, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Theme
import { DEFAULT_THEME } from '@src/utils/utils';

// System Logs
import logger from '@src/utils/logger';

export const load: PageServerLoad = async ({ cookies }) => {
	const session_id = cookies.get(SESSION_COOKIE_NAME);
	if (!session_id) {
		logger.warn('No session ID found, redirecting to login');
		throw redirect(302, '/login');
	}

	if (!auth || !dbAdapter) {
		logger.error('Authentication system or database adapter is not initialized');
		throw error(500, 'Internal Server Error');
	}

	try {
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session, redirecting to login');
			throw redirect(302, '/login');
		}

		// Convert MongoDB ObjectId to string to avoid serialization issues
		if (user._id) {
			user._id = user._id.toString();
		}

		// Fetch all media types concurrently
		const media_types = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const media_promises = media_types.map((type) => dbAdapter.findMany(type, {}));
		let results = await Promise.all(media_promises);

		results = results.map((arr, index) =>
			arr.map((item) => ({
				// Explicitly cast to MediaImage
				...item,
				_id: item._id.toString(),
				type: media_types[index].split('_')[1],
				url: constructUrl('global', item.hash, item.name, item.name.split('.').pop(), media_types[index]),
				thumbnailUrl: constructUrl('global', item.hash, `${item.name}-thumbnail`, item.name.split('.').pop(), media_types[index])
			}))
		);

		const media = results.flat();

		// Fetch theme
		let theme;
		try {
			theme = await dbAdapter.getDefaultTheme();
			theme = JSON.parse(JSON.stringify(theme)); // Ensure theme is serializable
		} catch (err) {
			logger.error('Error fetching default theme:', (err as Error).message);
			theme = DEFAULT_THEME;
		}

		logger.info('Media gallery data loaded successfully');
		return { user, media, theme };
	} catch (err) {
		logger.error('Error in media gallery load function:', (err as Error).message);
		throw error(500, 'Internal Server Error');
	}
};

// Collection name for media files
const collection_names = {
	application: 'media_documents',
	audio: 'media_audio',
	font: 'media_documents',
	example: 'media_documents',
	image: 'media_images',
	message: 'media_documents',
	model: 'media_documents',
	multipart: 'media_documents',
	text: 'media_documents',
	video: 'media_videos'
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) {
			logger.warn('No session ID found during file upload, redirecting to login');
			throw redirect(302, '/login');
		}

		if (!auth || !dbAdapter) {
			logger.error('Authentication system or database adapter is not initialized');
			throw error(500, 'Internal Server Error');
		}

		try {
			const user = await auth.validateSession({ session_id });
			if (!user) {
				logger.warn('Invalid session during file upload, redirecting to login');
				throw redirect(302, '/login');
			}

			const formData = await request.formData();
			const files = formData.getAll('files');

			const save_media_file = {
				application: saveDocument,
				audio: saveAudio,
				font: saveDocument,
				example: saveDocument,
				image: saveImage,
				message: saveDocument,
				model: saveDocument,
				multipart: saveDocument,
				text: saveDocument,
				video: saveVideo
			};

			for (const file of files) {
				if (file instanceof File) {
					const type = file.type.split('/')[0] as keyof typeof save_media_file;
					if (type in save_media_file) {
						const { fileInfo } = await save_media_file[type](file, collection_names[type], user._id);
						await dbAdapter.insertMany(collection_names[type], [{ ...fileInfo, user: user._id }]);
						logger.info(`File uploaded successfully: ${file.name}`);
					} else {
						logger.warn(`Unsupported file type: ${file.type}`);
					}
				}
			}

			return { success: true };
		} catch (err) {
			logger.error('Error during file upload:', (err as Error).message);
			return { success: false, error: 'File upload failed' };
		}
	}
};
