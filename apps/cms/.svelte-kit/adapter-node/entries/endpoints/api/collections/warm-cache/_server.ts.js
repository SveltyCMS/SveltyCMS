import { json } from '@sveltejs/kit';
import { contentManager } from '../../../../../chunks/ContentManager.js';
const POST = async ({ request, locals }) => {
	const { collectionId, entryIds } = await request.json();
	const tenantId = locals.tenantId;
	if (!collectionId || !Array.isArray(entryIds)) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
	try {
		await contentManager.warmEntriesCache(collectionId, entryIds, tenantId);
		return json({ success: true });
	} catch (err) {
		return json({ error: 'Failed to warm cache' }, { status: 500 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
