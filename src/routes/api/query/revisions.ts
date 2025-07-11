/**
 * @file src/routes/api/query/revisions.ts
 * @description Handler for fetching revision history for a collection entry.
 *
 * This module provides functionality to:
 * - Retrieve revision metadata for a list view.
 * - Retrieve a single revision and compare it to the current document state,
 * returning a structured "diff object" that describes the changes.
 */

import type { User } from '@src/auth/types';
import type { Schema } from '@src/content/types';
import { dbAdapter } from '@src/databases/db';
import type { ContentRevision } from '@src/databases/dbInterface';
import { isEqual } from 'lodash-es'; // Using a robust comparison function

// System Logger
import { logger } from '@utils/logger.svelte';

// Define a type for the document data we are comparing
type DocumentData = Record<string, unknown>;

// Define the structure of the diff object for type safety
interface DiffResult {
	status: 'added' | 'deleted' | 'modified';
	value?: unknown;
	old?: unknown;
	new?: unknown;
}

// Function to compare two documents and generate a diff object
function createDiffObject(oldDoc: DocumentData, newDoc: DocumentData): Record<string, DiffResult> {
	const diff: Record<string, DiffResult> = {};
	const allKeys = new Set([...Object.keys(oldDoc), ...Object.keys(newDoc)]);

	for (const key of allKeys) {
		if (key === '_id' || key === 'updatedAt' || key === 'createdAt') continue; // Ignore metadata fields

		const oldValue = oldDoc[key];
		const newValue = newDoc[key];

		// Use the safe way to check for property existence
		const newHasKey = Object.prototype.hasOwnProperty.call(newDoc, key);
		const oldHasKey = Object.prototype.hasOwnProperty.call(oldDoc, key);

		if (!newHasKey) {
			diff[key] = { status: 'deleted', value: oldValue };
		} else if (!oldHasKey) {
			diff[key] = { status: 'added', value: newValue };
		} else if (!isEqual(oldValue, newValue)) {
			diff[key] = { status: 'modified', old: oldValue, new: newValue };
		}
	}
	return diff;
}

export async function _REVISIONS({ data, schema, user }: { data: FormData; schema: Schema; user: User }) {
	const start = performance.now();
	try {
		logger.debug(`REVISIONS request received for schema: ${schema._id}, user_id: ${user._id}`);
		if (!dbAdapter) throw new Error('Database adapter not initialized');
		if (!schema._id) {
			logger.error('Invalid or undefined schema._id.');
			return new Response('Invalid schema._id', { status: 400 });
		}

		const entryId = data.get('entryId') as string;
		const revisionId = data.get('revisionId') as string;
		const metaOnly = data.get('metaOnly') === 'true';

		let resultData: unknown;

		if (revisionId && entryId) {
			// --- Fetch a single revision AND create a diff ---
			const currentDataJSON = data.get('currentData') as string;
			if (!currentDataJSON) {
				return new Response('currentData is required for diffing', { status: 400 });
			}

			const currentData: DocumentData = JSON.parse(currentDataJSON);

			// Fetch the historical revision from DB
			const revisionsResult = await dbAdapter.draftsAndRevisions.getRevisions(schema._id, entryId);
			const allRevisions: ContentRevision[] = Array.isArray(revisionsResult)
				? revisionsResult
				: (revisionsResult as { data: ContentRevision[] }).data || [];
			const revision = allRevisions.find((r) => r._id === revisionId);

			if (!revision) {
				return new Response('Revision not found', { status: 404 });
			}

			// Let the server create the simple diff object
			resultData = createDiffObject(revision.data as DocumentData, currentData);
		} else if (entryId && metaOnly) {
			// --- Fetch metadata list for the dropdown ---
			const revisionsResult = await dbAdapter.draftsAndRevisions.getRevisions(schema._id, entryId);
			const allRevisions: ContentRevision[] = Array.isArray(revisionsResult)
				? revisionsResult
				: (revisionsResult as { data: ContentRevision[] }).data || [];

			resultData = allRevisions.map((r) => ({
				_id: r._id,
				revision_at: r.revision_at || r.createdAt,
				revision_by: r.revision_by
			}));
		} else {
			return new Response('Invalid request parameters for revisions', { status: 400 });
		}

		const totalDuration = performance.now() - start;
		logger.info(`REVISIONS operation completed in ${totalDuration.toFixed(2)}ms`);

		return new Response(JSON.stringify({ success: true, data: resultData }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`REVISIONS operation failed after ${duration.toFixed(2)}ms for schema: ${schema._id}: ${errorMessage}`, { stack: errorStack });
		return new Response(
			JSON.stringify({
				success: false,
				error: errorMessage,
				performance: {
					total: duration
				}
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'X-Content-Type-Options': 'nosniff'
				}
			}
		);
	}
}
