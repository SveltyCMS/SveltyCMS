/**
 * @file src/routes/(app)/mediagallery/uploadMedia/+page.server.ts
 * @description Server actions for media upload.
 */

import type { MediaAccess } from '@root/src/utils/media/mediaModels';
import { dbAdapter } from '@src/databases/db';
import { MediaService } from '@src/utils/media/mediaService.server';
import { error, redirect } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { Actions } from './$types';

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw error(500, 'Internal Server Error');
		}

		try {
			const user = locals.user;
			if (!user) {
				logger.warn('No user found in locals during file upload');
				throw redirect(302, '/login');
			}

			const formData = await request.formData();
			const files = formData.getAll('files');

			const mediaService = new MediaService(dbAdapter);
			const access: MediaAccess = 'public';

			for (const file of files) {
				if (file instanceof File) {
					try {
						await mediaService.saveMedia(file, user._id, access, 'global');
						logger.info(`File uploaded successfully: ${file.name}`);
					} catch (fileError) {
						const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
						if (errorMessage.includes('duplicate')) {
							logger.warn(`A file with name "${file.name}" already exists`);
							throw new Error(`A file with name "${file.name}" already exists`);
						}
						throw new Error(errorMessage);
					}
				}
			}

			return { success: true };
		} catch (err) {
			let userMessage = 'Error uploading file';
			if (err instanceof Error) {
				userMessage = err.message;
			}
			logger.error(`Error during file upload: ${err instanceof Error ? err.message : String(err)}`);
			throw error(400, userMessage);
		}
	},

	remoteUpload: async ({ request, locals }) => {
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw error(500, 'Internal Server Error');
		}

		try {
			const user = locals.user;
			if (!user) {
				logger.warn('No user found in locals during file upload');
				throw redirect(302, '/login');
			}

			const formData = await request.formData();
			const remoteUrls = JSON.parse(formData.get('remoteUrls') as string) as string[];

			if (!(remoteUrls && Array.isArray(remoteUrls)) || remoteUrls.length === 0) {
				throw new Error('No URLs provided');
			}

			const mediaService = new MediaService(dbAdapter);
			const access: MediaAccess = 'public';

			for (const url of remoteUrls) {
				try {
					const response = await fetch(url);
					if (!response.ok) {
						logger.warn(`Failed to fetch remote URL: ${url}`);
						continue;
					}
					const arrayBuffer = await response.arrayBuffer();
					const buffer = Buffer.from(arrayBuffer);
					const contentType = response.headers.get('content-type') || 'application/octet-stream';
					const filename = url.substring(url.lastIndexOf('/') + 1);

					const file = new File([buffer], filename, { type: contentType });

					await mediaService.saveMedia(file, user._id, access, 'global');
					logger.info(`Remote file uploaded successfully: ${file.name}`);
				} catch (fileError) {
					const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
					if (errorMessage.includes('duplicate')) {
						logger.warn(`A file from URL "${url}" already exists`);
					} else {
						logger.error(`Failed to upload file from ${url}: ${errorMessage}`);
					}
				}
			}

			return { success: true };
		} catch (err) {
			let userMessage = 'Error uploading file';
			if (err instanceof Error) {
				userMessage = err.message;
			}
			logger.error(`Error during remote file upload: ${err instanceof Error ? err.message : String(err)}`);
			throw error(400, userMessage);
		}
	}
};
