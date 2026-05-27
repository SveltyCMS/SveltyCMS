/**
 * @file src/routes/(app)/config/accessManagement/+page.server.ts
 * @description Server-side logic for Access Management page using simplified auth system.
 */

// Auth - getAllPermissions is lightweight, no heavy queries needed
import { getAllPermissions } from '@src/databases/auth/permissions';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = locals;

	if (!user) {
		throw redirect(302, '/login');
	}

	// Access Management is admin-only — locals.isAdmin is set fresh by the authorization hook
	if (!locals.isAdmin) {
		throw error(403, 'Insufficient permissions');
	}

	const permissions = getAllPermissions();
	const roles = locals.roles ?? [];

	return {
		user: {
			_id: user._id.toString(),
			email: user.email,
			role: user.role
		},
		roles,
		permissions
	};
};
