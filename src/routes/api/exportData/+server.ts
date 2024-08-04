/**
 * @file src/routes/api/exportData/+server.ts
 * @description API endpoint for exporting data from all collections.
 *
 * This module handles the export of data from all collections:
 * - Authenticates the user (admin only)
 * - Retrieves data from all collections
 * - Writes the data to a file specified by EXTRACT_DATA_PATH
 *
 * Features:
 * - Authentication and authorization checks
 * - Concurrent data fetching from collections
 * - Error logging and handling
 *
 * Usage:
 * GET /api/exportData
 * Requires: Admin authentication
 */

import { promises as fs } from 'fs';
import path from 'path';

import type { RequestHandler } from './$types';
import { publicEnv } from '@root/config/public';
import { _GET } from '@api/query/GET';
// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
// Stores
import { collections } from '@src/stores/store';
import { get } from 'svelte/store';
// System Logger
import logger from '@src/utils/logger';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) {
			logger.warn('No session ID found in cookies.');
			return new Response('Unauthorized', { status: 401 });
		}
		logger.debug('Session ID retrieved');

		if (!auth) {
			logger.error('Authentication system is not initialized');
			return new Response('Internal Server Error', { status: 500 });
		}

		// Validate the session.
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session.');
			return new Response('Unauthorized', { status: 401 });
		}
		logger.debug('User validated');

		if (user.role !== 'admin') {
			logger.warn('Non-admin access attempt.');
			return new Response('Forbidden', { status: 403 });
		}

		// Get the collection model.
		const $collections = get(collections);
		logger.debug('Collections retrieved from store.');

		// Fetch data from all collections concurrently
		const data = await fetchAllCollectionData($collections, user);

		if (!publicEnv.EXTRACT_DATA_PATH) {
			logger.error('EXTRACT_DATA_PATH not configured');
			return new Response('EXTRACT_DATA_PATH not configured', { status: 500 });
		}

		// Write data to file
		await writeDataToFile(data, publicEnv.EXTRACT_DATA_PATH);

		logger.info(`Data successfully written to ${publicEnv.EXTRACT_DATA_PATH}`);
		return new Response('Data export completed successfully', { status: 200 });
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Error during data export:', { error: errorMessage });
		return new Response('Internal Server Error', { status: 500 });
	}
};

async function fetchAllCollectionData(collections: any, user: any) {
	const fetchPromises = Object.values(collections).map(async (collection: any) => {
		const name = collection.name as string;
		logger.debug(`Fetching data for collection: ${name}`);
		const response = await _GET({ schema: collection, user });
		const { entryList } = await response.json();
		return [name, entryList];
	});

	const results = await Promise.all(fetchPromises);
	return Object.fromEntries(results);
}

async function writeDataToFile(data: any, filePath: string) {
	const jsonData = JSON.stringify(data).replace(/\/media/g, 'media');
	await fs.writeFile(path.resolve(filePath), jsonData);
}
