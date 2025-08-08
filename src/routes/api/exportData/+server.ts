/**
 * @file src/routes/api/exportData/+server.ts
 * @description API endpoint for exporting data from all collections.
 *
 * This module handles the export of data from all collections for the current tenant:
 * - Authenticates the user (admin or specific roles with permissions)
 * - Retrieves data from all collections belonging to the current tenant
 * - Writes the data to a tenant-specific file based on EXTRACT_DATA_PATH
 *
 * Features:
 * - Authentication and authorization checks
 * - Concurrent, tenant-aware data fetching from collections
 * - Error logging and handling
 *
 * Usage:
 * GET /api/exportData
 * Requires: Admin authentication or specific roles with appropriate permissions
 *
 */

import { promises as fs } from 'fs';
import path from 'path';
import { error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

import type { RequestHandler } from './$types';
import { publicEnv } from '@root/config/public';

// Database adapter for collection queries
import { dbAdapter } from '@src/databases/db';

// Stores
import { collections } from '@stores/collectionStore.svelte';

// Permissions

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
	const { user, tenantId } = locals;
	try {
		// Authentication is handled by hooks.server.ts
		if (!user) {
			logger.warn('Unauthorized attempt to access export data');
			throw error(401, 'Unauthorized');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		logger.debug('User has permission to export data', { tenantId });

		// Fetch data from all collections concurrently, scoped to the tenant
		const data = await fetchAllCollectionData(collections.value, tenantId);

		// Ensure the EXTRACT_DATA_PATH environment variable is configured

		if (!publicEnv.EXTRACT_DATA_PATH) {
			logger.error('EXTRACT_DATA_PATH not configured');
			throw error(500, 'Server configuration error: EXTRACT_DATA_PATH not set');
		}

		// --- MULTI-TENANCY: Modify the file path to be tenant-specific ---
		let filePath = publicEnv.EXTRACT_DATA_PATH;
		if (privateEnv.MULTI_TENANT && tenantId) {
			const dir = path.dirname(filePath);
			const ext = path.extname(filePath);
			const base = path.basename(filePath, ext);
			filePath = path.join(dir, `${base}-${tenantId}${ext}`);
		} // Write the fetched data to the specified file

		await writeDataToFile(data, filePath);
		logger.info(`Data successfully written to ${filePath}`, { tenantId });

		return new Response('Data export completed successfully', { status: 200 });
	} catch (err) {
		if (err.status && err.body) {
			// This is likely an error thrown by the `error` function
			logger.error(`Error during data export: ${err.body.message}`, { tenantId });
			throw err; // Re-throw the SvelteKit error
		} else {
			// This is an unexpected error
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			logger.error('Unexpected error during data export:', { error: errorMessage, tenantId });
			throw error(500, 'Internal Server Error during data export');
		}
	}
};

// Fetches data from all collections concurrently
async function fetchAllCollectionData(collections: Record<string, DatabaseCollection>, tenantId?: string) {
	const fetchPromises = Object.values(collections).map(async (collection: DatabaseCollection) => {
		const name = collection.name;
		logger.debug(`Fetching data for collection: ${name}`, { tenantId });

		try {
			const filter = privateEnv.MULTI_TENANT && tenantId ? { tenantId } : {}; // Use the database adapter to fetch collection entries, scoped by tenant
			const result = await dbAdapter.getCollectionData(name, filter);
			const entryList = result.success ? result.data : [];
			return [name, entryList];
		} catch (error) {
			logger.error(`Error fetching data for collection ${name}:`, { error, tenantId });
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
