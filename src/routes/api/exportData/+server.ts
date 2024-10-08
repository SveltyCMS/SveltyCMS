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

// Stores
import { get } from 'svelte/store';
import { collections } from '@stores/collectionStore';

// System Logger
import { logger } from '@utils/logger';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Check if the user has the necessary permissions
		if (!locals.permissions.includes('data:export') && !locals.user.isAdmin) {
			logger.warn('User lacks required permission: data:export');
			throw error(403, 'Forbidden: Insufficient permissions');
		}
		logger.debug('User has permission to export data');

		// Retrieve collections from the store
		const $collections = get(collections);
		logger.debug('Collections retrieved from store');

		// Fetch data from all collections concurrently
		const data = await fetchAllCollectionData($collections, locals.user);

		// Ensure the EXTRACT_DATA_PATH environment variable is configured
		if (!publicEnv.EXTRACT_DATA_PATH) {
			logger.error('EXTRACT_DATA_PATH not configured');
			throw error(500, 'Server configuration error: EXTRACT_DATA_PATH not set');
		}

		// Write the fetched data to the specified file
		await writeDataToFile(data, publicEnv.EXTRACT_DATA_PATH);
		logger.info(`Data successfully written to ${publicEnv.EXTRACT_DATA_PATH}`);

		return new Response('Data export completed successfully', { status: 200 });
	} catch (err) {
		if (err.status && err.body) {
			// This is likely an error thrown by the `error` function
			logger.error(`Error during data export: ${err.body.message}`);
			throw err; // Re-throw the SvelteKit error
		} else {
			// This is an unexpected error
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			logger.error('Unexpected error during data export:', { error: errorMessage });
			throw error(500, 'Internal Server Error during data export');
		}
	}
};

// Fetches data from all collections concurrently
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

// Writes the provided data to a file at the specified file path
async function writeDataToFile(data: any, filePath: string) {
	const jsonData = JSON.stringify(data).replace(/\/media/g, 'media');
	await fs.writeFile(path.resolve(filePath), jsonData);
}
