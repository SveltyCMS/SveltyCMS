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
 *
 * @example GET /api/exportData
 *
 * Features:
 * - Authenticates the user (admin or specific roles with permissions)
 * - Retrieves data from all collections
 * - Writes the data to a file specified by EXTRACT_DATA_PATH
 */

import { promises as fs } from 'fs';
import path from 'path';
import { error } from '@sveltejs/kit';

import type { RequestHandler } from './$types';
import { getPublicSetting } from '@src/stores/globalSettings';

// Database adapter for collection queries
import { dbAdapter } from '@src/databases/db';

// Stores
import { collections } from '@stores/collectionStore.svelte';

// Permissions
import { checkApiPermission } from '@api/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

interface DatabaseCollection {
	name: string;
}

interface CollectionEntry {
	_id: string;
	status?: string;
	createdAt?: string;
	updatedAt?: string;
	[key: string]: unknown;
}

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Use centralized permission checking
		const permissionResult = await checkApiPermission(locals.user, {
			resource: 'system',
			action: 'read'
		});

		if (!permissionResult.hasPermission) {
			logger.warn('Data export permission denied', {
				userId: locals.user?._id,
				userRole: locals.user?.role,
				error: permissionResult.error
			});
			throw error(403, permissionResult.error || 'Forbidden: Insufficient permissions');
		}

		logger.debug('User has permission to export data');

		// Fetch data from all collections concurrently
		const data = await fetchAllCollectionData(collections.value);

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
async function fetchAllCollectionData(collections: Record<string, DatabaseCollection>) {
	const fetchPromises = Object.values(collections).map(async (collection: DatabaseCollection) => {
		const name = collection.name;
		logger.debug(`Fetching data for collection: ${name}`);

		try {
			// Use the database adapter to fetch collection entries
			const result = await dbAdapter.getCollectionData(name);
			const entryList = result.success ? result.data : [];
			return [name, entryList];
		} catch (error) {
			logger.error(`Error fetching data for collection ${name}:`, error);
			return [name, []]; // Return empty array if collection fetch fails
		}
	});

	const results = await Promise.all(fetchPromises);
	return Object.fromEntries(results);
}

// Writes the provided data to a file at the specified file path
async function writeDataToFile(data: Record<string, CollectionEntry[]>, filePath: string) {
	const jsonData = JSON.stringify(data).replace(/\/media/g, 'media');
	await fs.writeFile(path.resolve(filePath), jsonData);
}
