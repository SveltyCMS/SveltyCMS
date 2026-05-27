/**
 * @file src/routes/(app)/config/systemsetting/+page.server.ts
 * @description Server-side logic for System Settings page authentication and authorization.
 */

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = locals;

	if (!user) {
		throw redirect(302, '/login');
	}

	// locals.isAdmin and locals.roles are set fresh by handleAuthorization on every request
	const isAdmin = locals.isAdmin === true;
	const userRole = (locals.roles ?? []).find((r) => r._id === user.role);

	// Admins have full access; non-admins need the config:settings permission
	const hasSystemSettingsPermission =
		isAdmin ||
		(userRole?.permissions?.some((p) => {
			const [resource, action] = p.split(':');
			return resource === 'config' && action === 'settings';
		}) ??
			false);

	if (!hasSystemSettingsPermission) {
		throw error(403, 'Insufficient permissions');
	}

	const { _id, ...rest } = user;
	return {
		user: { _id: _id.toString(), ...rest },
		isAdmin
	};
};
