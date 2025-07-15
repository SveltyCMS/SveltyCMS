/**
 * @file src/routes/api/dashboard/last5Content/+server.ts
 * @description API endpoint for recent content data for dashboard widgets.
 */

import { error, json } from '@sveltejs/kit';
import crypto from 'crypto';
import type { RequestHandler } from './$types';

import { contentManager } from '@root/src/content/ContentManager';

// Validation
import * as v from 'valibot';
// System Logger
import { logger } from '@utils/logger.svelte';

// --- Schemas for Validation ---

const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20)), 5)
});

const ContentItemSchema = v.object({
	id: v.string(),
	title: v.string(),
	collection: v.string(),
	createdAt: v.date(),
	createdBy: v.string(),
	status: v.string()
});

// --- API Handler ---

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		// 1. Validate Input
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || undefined
		});

		// 2. Fetch and Normalize Data
		const { contentStructure } = await contentManager.getCollectionData();
		let allEntries: any[] = [];

		if (Array.isArray(contentStructure)) {
			// Flatten all entries from all collections into a single array
			allEntries = contentStructure.flatMap((collection) =>
				(collection.entries ?? []).map((entry: any) => ({
					...entry,
					collectionName: collection.name || collection.label || 'Unknown Collection'
				}))
			);
		}

		// 3. Sort by date to find the most recent entries
		allEntries.sort((a, b) => {
			const dateA = new Date(a.createdAt || a.created || a.date || 0).getTime();
			const dateB = new Date(b.createdAt || b.created || b.date || 0).getTime();
			return dateB - dateA;
		});

		// 4. Transform and Validate the final data structure
		const recentContent = allEntries.slice(0, query.limit).map((entry) => ({
			id: entry.id || entry._id || crypto.randomUUID(),
			title: entry.title || entry.name || entry.label || 'Untitled',
			collection: entry.collectionName,
			createdAt: new Date(entry.createdAt || entry.created || entry.date || new Date()),
			createdBy: entry.createdBy || entry.author || entry.creator || 'Unknown',
			status: entry.status || entry.state || 'published'
		}));

		const validatedData = v.parse(v.array(ContentItemSchema), recentContent);

		logger.info('Recent content fetched successfully', { count: validatedData.length, requestedBy: locals.user?._id });
		return json(validatedData);
	} catch (err) {
		if (err instanceof v.ValiError) {
			logger.error('Content data failed validation', { error: err.issues });
			throw error(500, 'Internal Server Error: Could not prepare content data.');
		}
		logger.error('Error fetching recent content:', err);
		throw error(500, 'An unexpected error occurred.');
	}
};
