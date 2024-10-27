/**
 * @file src/route/api/media/saveMedia.svelte
 * @description
 */

import { json } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logger
import logger from '@src/utils/logger';

const mediaService = new MediaService();

export async function POST({ request, cookies }) {
	const session_id = cookies.get(SESSION_COOKIE_NAME);
	if (!session_id) {
		logger.warn('No session ID found during file upload');
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session during file upload');
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const formData = await request.formData();
		const files = formData.getAll('files');

		if (files.length === 0) {
			logger.warn('No files received for upload');
			return json({ success: false, error: 'No files received' }, { status: 400 });
		}

		const results = [];
		for (const file of files) {
			if (file && typeof file === 'object' && 'name' in file && 'size' in file) {
				try {
					const result = await mediaService.saveMedia(file, user._id.toString());
					results.push({ fileName: file.name, success: true, data: result });
				} catch (error) {
					logger.error(`Error saving file ${file.name}:`, error);
					results.push({ fileName: file.name, success: false, error: error.message });
				}
			} else {
				results.push({ fileName: 'unknown', success: false, error: 'Invalid file object' });
			}
		}

		logger.info(`Processed ${files.length} files for user ${user._id}`);
		return json({ success: true, results });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error in file upload process:', { error: errorMessage });
		return json({ success: false, error: `Error in file upload process: ${error.message}` }, { status: 500 });
	}
}
