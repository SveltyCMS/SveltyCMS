// API endpoint to import settings from a JSON snapshot
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import { updateSettingsFromSnapshot } from '@src/stores/globalSettings';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !hasPermissionByAction(locals.user, 'manage', 'settings')) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	try {
		const snapshot = await request.json();
		const result = await updateSettingsFromSnapshot(snapshot);
		return new Response(JSON.stringify({ success: true, result }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return new Response(JSON.stringify({ error: 'Invalid snapshot', details: err?.message }), { status: 400 });
	}
};
