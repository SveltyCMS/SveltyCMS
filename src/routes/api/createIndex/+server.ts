/**
 * @file src/routes/api/createIndex/+server.ts
 * @description API endpoint for creating index files for collections.
 *
 * This module handles the creation of index files for each collection:
 * - Ensures the indexes directory exists
 * - Authenticates the user (admin only)
 * - Retrieves collections and their entries
 * - Generates formatted text content for each entry
 * - Writes index files for each collection
 *
 * Features:
 * - Authentication and authorization checks
 * - Concurrent processing of collections
 * - Custom widget handling for field data formatting
 * - Error logging and handling
 *
 * Usage:
 * GET /api/createIndex
 * Requires: Admin authentication
 */

import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from '@sveltejs/kit';

import { _GET } from '../query/GET';
import { getFieldName } from '@src/utils/utils';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Stores
import { get } from 'svelte/store';
import { collections } from '@src/stores/collectionStore';

// Components
import widgets from '@src/components/widgets';

// System Logger
import logger from '@src/utils/logger';

const INDEXES_DIR = './indexes';

// Define the GET request handler
export const GET: RequestHandler = async ({ cookies }) => {
	try {
		// Create the indexes directory if it doesn't exist
		await fs.mkdir(INDEXES_DIR, { recursive: true });
		logger.debug('Indexes directory ensured to exist.');

		// Retrieve the session ID from cookies
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) {
			logger.warn('No session ID found in cookies.');
			return new Response('Unauthorized', { status: 401 });
		}
		logger.debug('Session ID retrieved');

		// Check if the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			return new Response('Internal Server Error', { status: 500 });
		}

		// Validate the session
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session.');
			return new Response('Unauthorized', { status: 401 });
		}
		logger.debug('User validated');

		// Check if the user has admin role
		if (user.role !== 'admin') {
			logger.warn('Non-admin access attempt.');
			return new Response('Forbidden', { status: 403 });
		}

		// Retrieve collections from the store
		const $collections = get(collections);
		logger.debug('Collections retrieved from store.');

		// Process all collections concurrently
		await Promise.all(Object.values($collections).map((collection) => processCollection(collection, user)));

		// Return a success response
		logger.info('Index files creation completed successfully.');
		return new Response('Index files created successfully', { status: 200 });
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Error during index creation:', { error: errorMessage });
		return new Response('Internal Server Error', { status: 500 });
	}
};

// Function to process a single collection
async function processCollection(collection: any, user: any) {
	try {
		let text = '';

		// Fetch entry list for the collection
		const response = await _GET({
			schema: collection,
			user: {
				_id: user._id,
				email: user.email,
				role: user.role
			}
		});
		const { entryList } = await response.json();
		logger.debug(`Entry list fetched for collection: ${collection.name}`);

		// Process each entry
		for (const entry of entryList) {
			const entry_text = processEntry(entry, collection.fields);
			if (entry_text) {
				text += `\n\n_id:${entry._id.toString()}\n${entry_text}`;
			}
		}

		// Write the formatted text to a file
		if (text) {
			const filePath = path.join(INDEXES_DIR, `${collection.name}.txt`);
			await fs.writeFile(filePath, text);
			logger.debug(`Index file written: ${filePath}`);
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error(`Error processing collection ${collection.name}:`, { error: errorMessage });
	}
}

// Function to process a single entry
function processEntry(entry: any, fields: any[]): string {
	return fields
		.map((field) => {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);
			return 'toString' in widget ? widget.toString({ field, data: entry[fieldName] }) : '';
		})
		.filter(Boolean)
		.join('\n')
		.trim();
}
