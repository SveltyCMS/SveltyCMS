/**
 * @file src/routes/api/query/revisions.ts
 * @description Handler for fetching revision history for a collection entry.
 *
 * This module provides functionality to:
 * - Retrieve revision metadata for a list view.
 * - Retrieve a single revision and compare it to the current document state,
 * returning a structured "diff object" that describes the changes.
 * - Retrieve the full data of a single revision for reverting.
 */

import type { User } from '@src/auth/types';
import type { Schema } from '@src/content/types';
import { dbAdapter } from '@src/databases/db';
import type { ContentRevision } from '@src/databases/dbInterface';

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

/**
 * Performs a deep comparison between two values to determine if they are equivalent.
 * @param obj1 The first value to compare.
 * @param obj2 The second value to compare.
 * @returns `true` if the values are equivalent, `false` otherwise.
 */
function deepEqual(obj1: unknown, obj2: unknown): boolean {
	if (obj1 === obj2) return true;

	if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
		return false;
	}

	const keys1 = Object.keys(obj1 as DocumentData);
	const keys2 = Object.keys(obj2 as DocumentData);

	if (keys1.length !== keys2.length) return false;

	for (const key of keys1) {
		const val1 = (obj1 as DocumentData)[key];
		const val2 = (obj2 as DocumentData)[key];
		const areObjects = typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null;

		if ((areObjects && !deepEqual(val1, val2)) || (!areObjects && val1 !== val2)) {
			return false;
		}
	}

	return true;
}

// Function to compare two documents and generate a diff object
function createDiffObject(oldDoc: DocumentData, newDoc: DocumentData): Record<string, DiffResult> {
	const diff: Record<string, DiffResult> = {};
	const allKeys = new Set([...Object.keys(oldDoc), ...Object.keys(newDoc)]);
	const ignoreKeys = new Set(['_id', 'updatedAt', 'createdAt', '__v', 'revision_at', 'revision_by']);

	for (const key of allKeys) {
		if (ignoreKeys.has(key)) continue;

		const oldValue = oldDoc[key];
		const newValue = newDoc[key];

		// Use the safe way to check for property existence
		const oldHasKey = Object.prototype.hasOwnProperty.call(oldDoc, key);
		const newHasKey = Object.prototype.hasOwnProperty.call(newDoc, key);

		if (oldHasKey && !newHasKey) {
			diff[key] = { status: 'deleted', value: oldValue };
		} else if (!oldHasKey && newHasKey) {
			diff[key] = { status: 'added', value: newValue };
		} else if (!deepEqual(oldValue, newValue)) {
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
		if (!schema._id) throw new Error('Invalid or undefined schema._id.');

		const entryId = data.get('entryId') as string;
		if (!entryId) return new Response('entryId is required', { status: 400 });

		const revisionId = data.get('revisionId') as string;
		const metaOnly = data.get('metaOnly') === 'true';
		const diffOnly = data.get('diffOnly') === 'true';

		let resultData: unknown;

		if (metaOnly) {
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
		} else if (revisionId) {
			const collection = dbAdapter.collection.getModel(schema._id);
			if (!collection) throw new Error(`Collection not found: ${schema._id}`);

			// Fetch the historical revision from DB
			const revision = await dbAdapter.draftsAndRevisions.getRevision(schema._id, revisionId);
			if (!revision) return new Response('Revision not found', { status: 404 });

			if (diffOnly) {
				// --- Fetch a single revision AND create a diff ---
				const currentEntry = await collection.findById(entryId);
				if (!currentEntry) return new Response('Current entry not found', { status: 404 });
				resultData = createDiffObject(revision.data as DocumentData, currentEntry.toObject());
			} else {
				// --- Fetch the full data of a single revision (for reverting) ---
				resultData = revision.data;
			}
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
		logger.error(`REVISIONS operation failed after ${duration.toFixed(2)}ms: ${errorMessage}`, { stack: errorStack });
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
