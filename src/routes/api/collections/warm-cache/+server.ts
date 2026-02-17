import { contentManager } from '@src/content/ContentManager';
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
