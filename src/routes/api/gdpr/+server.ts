/**
 * @file src/routes/api/gdpr/+server.ts
 * @description API endpoint for GDPR operations.
 *
 * Features:
 * - Export user data
 * - Anonymize user data
 *
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gdprService } from '@src/services/GDPRService';

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Security Check
	// Access locals.user directly as per SveltyCMS convention
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Ideally we would check for admin role here
	// if (locals.user.role !== 'admin') ...

	try {
		const { action, userId, reason } = await request.json();

		if (!userId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		if (action === 'export') {
			const data = await gdprService.exportUserData(userId);
			return json({ success: true, data });
		}

		if (action === 'anonymize') {
			const success = await gdprService.anonymizeUser(userId, reason || 'Admin Manual Request');
			if (!success) {
				return json({ error: 'Anonymization failed. Check server logs.' }, { status: 500 });
			}
			return json({ success: true });
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (err: any) {
		console.error('GDPR API Error:', err);
		return json({ error: err.message || 'Internal Server Error' }, { status: 500 });
	}
};
