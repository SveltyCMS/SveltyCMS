// API endpoint to export all settings as a JSON snapshot
import { hasPermissionByAction } from '@src/auth/permissions';
import { getAllSettings } from '@src/stores/globalSettings';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !hasPermissionByAction(locals.user, 'manage', 'settings')) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const settings = await getAllSettings();
	return new Response(JSON.stringify(settings, null, 2), {
		headers: { 'Content-Type': 'application/json' }
	});
};
