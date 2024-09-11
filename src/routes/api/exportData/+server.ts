/**
 * @file src/routes/api/exportData/+server.ts
 * @description API endpoint for exporting data from all collections.
 *
 * This module handles the export of data from all collections:
 * - Authenticates the user (admin or specific roles with permissions)
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
 * Requires: Admin authentication or specific roles with appropriate permissions
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

import { validateUserPermission } from '@src/auth/permissionManager';

// System Logger
import logger from '@src/utils/logger';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Retrieve the session ID from cookies.
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) {
			logger.warn('No session ID found in cookies.');
			return new Response('Unauthorized', { status: 401 });
		}
		logger.debug('Session ID retrieved.');

		// Check if the authentication system is initialized.
		if (!auth) {
			logger.error('Authentication system is not initialized.');
			return new Response('Internal Server Error', { status: 500 });
		}

		// Validate the session and retrieve the user.
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session.');
			return new Response('Unauthorized', { status: 401 });
		}
		logger.debug('User validated.');

		// Check if the user is an admin or has the necessary permissions
		if (!user.isAdmin) {
			const requiredPermission = 'data:export';
			const userPermissions = user.permissions || [];

			if (!validateUserPermission(userPermissions, requiredPermission)) {
				logger.warn(`User lacks required permission: ${requiredPermission}`);
				return new Response('Forbidden', { status: 403 });
			}
			logger.debug(`User has permission: ${requiredPermission}`);
		} else {
			logger.debug('User is an admin.');
		}

		// Retrieve collections from the store.
		const $collections = get(collections);
		logger.debug('Collections retrieved from store.');

		// Fetch data from all collections concurrently.
		const data = await fetchAllCollectionData($collections, user);

		// Ensure the EXTRACT_DATA_PATH environment variable is configured.
		if (!publicEnv.EXTRACT_DATA_PATH) {
			logger.error('EXTRACT_DATA_PATH not configured.');
			return new Response('EXTRACT_DATA_PATH not configured', { status: 500 });
		}

		// Write the fetched data to the specified file.
		await writeDataToFile(data, publicEnv.EXTRACT_DATA_PATH);
		logger.info(`Data successfully written to ${publicEnv.EXTRACT_DATA_PATH}.`);

		return new Response('Data export completed successfully', { status: 200 });
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Error during data export:', { error: errorMessage });
		return new Response('Internal Server Error', { status: 500 });
	}
};

// Fetches data from all collections concurrently.
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

// Writes the provided data to a file at the specified file path.
async function writeDataToFile(data: any, filePath: string) {
	const jsonData = JSON.stringify(data).replace(/\/media/g, 'media');
	await fs.writeFile(path.resolve(filePath), jsonData);
}
