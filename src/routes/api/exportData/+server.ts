import fs from 'fs';
import type { RequestHandler } from './$types';
import { publicEnv } from '@root/config/public';
import { _GET } from '@api/query/GET';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Stores
import { collections } from '@src/stores/store';
import { get } from 'svelte/store';

// System Logs
import {logger} from '@src/utils/logger';

export const GET: RequestHandler = async ({ cookies }) => {
	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
	logger.debug(`Session ID retrieved: ${session_id}`);

	if (!auth) {
		logger.error('Authentication system is not initialized');
		return new Response('Internal Server Error', { status: 500 });
	}

	// Validate the session.
	const user = await auth.validateSession({ session_id });
	logger.debug(`User validated: ${JSON.stringify(user)}`);

	if (!user || user.role !== 'admin') {
		logger.warn('Unauthorized access attempt.');
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const $collections = get(collections);
	logger.debug('Collections retrieved from store.');

	// Get the form data.
	const data: { [key: string]: any } = {};

	for (const collection of Object.values($collections)) {
		const name = collection.name as string;
		logger.debug(`Fetching data for collection: ${name}`);
		data[name] = (
			await (
				await _GET({
					schema: collection,
					user
				})
			).json()
		).entryList;
	}

	if (publicEnv.EXTRACT_DATA_PATH) {
		fs.writeFileSync(publicEnv.EXTRACT_DATA_PATH, JSON.stringify(data).replaceAll('/media', 'media'));
		logger.info(`Data successfully written to ${publicEnv.EXTRACT_DATA_PATH}`);
		return new Response('', { status: 200 });
	} else {
		logger.error('EXTRACT_DATA_PATH not configured');
		return new Response('EXTRACT_DATA_PATH not configured', { status: 500 });
	}
};
