/**
 * @file src/routes/api/collections/warm-cache/+server.ts
 * @description
 * API endpoint for proactively warming the content cache for specific entries.
 * This helps improve performance by ensures frequently accessed data is
 * pre-loaded in the cache layer.
 *
 * features:
 * - individual and bulk entry cache warming
 * - tenant-isolated cache population
 * - integration with content manager services
 */

import { contentManager } from '@src/content/content-manager';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { collectionId, entryIds } = await request.json();
	const tenantId = locals.tenantId;

	if (!(collectionId && Array.isArray(entryIds))) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	try {
		await contentManager.warmEntriesCache(collectionId, entryIds, tenantId);
		return json({ success: true });
	} catch {
		return json({ error: 'Failed to warm cache' }, { status: 500 });
	}
};
