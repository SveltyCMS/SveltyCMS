/**
 * @file src/routes/api/gdpr/+server.ts
 * @description API endpoint for GDPR operations.
 *
 * Features:
 * - Export user data
 * - Anonymize user data
 *
 */

import { gdprService } from '@src/services/GDPRService';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Security Check
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { action, userId, reason } = await request.json();

		if (!userId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// 2. Authorization Check: Only admins or the user themselves can perform these actions
		const isSelf = locals.user._id.toString() === userId.toString();
		if (!(locals.isAdmin || isSelf)) {
			return json({ error: 'Forbidden: You can only perform this action on your own data' }, { status: 403 });
		}

		if (action === 'export') {
			const data = await gdprService.exportUserData(userId);
			return json({ success: true, data });
		}

		if (action === 'anonymize') {
			const success = await gdprService.anonymizeUser(userId, reason || (isSelf ? 'User Self-Request' : 'Admin Manual Request'));
			if (!success) {
				return json({ error: 'Anonymization failed. Check server logs.' }, { status: 500 });
			}
			return json({ success: true });
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (err) {
		const error = err as Error;
		console.error('GDPR API Error:', error);
		return json({ error: error.message || 'Internal Server Error' }, { status: 500 });
	}
};
