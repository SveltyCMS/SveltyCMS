/**
 * @file src/routes/(app)/config/import-export/+page.server.ts
 * @description Server-side logic for the Import/Export configuration page
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth check is handled by hooks.server.ts

export const load: PageServerLoad = async ({ locals }) => {
	const { user, isAdmin } = locals;

	// Additional permission check for admin features
	if (!user || !isAdmin) {
		throw error(403, 'Access denied. Admin privileges required for import/export functionality.');
	}

	return {
		user: {
			id: user._id,
			username: user.username,
			email: user.email,
			role: user.role,
			isAdmin: isAdmin || false
		}
	};
};
