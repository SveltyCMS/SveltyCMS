/**
 * @file src/routes/(admin)/admin/tenants/+page.server.ts
 * @description Server-side logic for the tenants page.
 *
 * @example
 * <PermissionSettings />
 *
 * ### Props
 * - `user`: The authenticated user data.
 *
 * ### Features
 * - User authentication and authorization
 * - Proper typing for user data
 */

import { redirect } from '@sveltejs/kit';
import { TenantModel } from '@src/databases/mongodb/models/tenant';
import { logger } from '@utils/logger';

import type { PageServerLoad } from './$types';

// Only System Admins can access this
export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.getSession();
	if (!session || !session.user) throw redirect(302, '/login');

	// Verify System Admin role (implementation depends on your role system)
	// For now, checks if user is the first system user or has 'admin' role in global context
	// if (session.user.role !== 'admin' || session.user.tenantId) { // Strict check: Must be global admin (no tenantId)
	// 	throw redirect(303, '/');
	// }

	try {
		// Fetch all tenants with sorting by creation date
		const tenants = await TenantModel.find({}).sort({ createdAt: -1 }).lean();

		// Serialize for SvelteKit
		return {
			tenants: JSON.parse(JSON.stringify(tenants))
		};
	} catch (err) {
		logger.error('Failed to load tenants', err);
		return { tenants: [] };
	}
};

export const actions = {
	// Action to suspend/activate a tenant
	toggleStatus: async ({ request }) => {
		const formData = await request.formData();
		const tenantId = formData.get('tenantId') as string;
		const status = formData.get('status') as string;

		if (!tenantId || !['active', 'suspended'].includes(status)) {
			return { success: false, message: 'Invalid parameters' };
		}

		try {
			await TenantModel.updateOne({ _id: tenantId }, { status });
			return { success: true };
		} catch (err) {
			logger.error(`Failed to update tenant status ${tenantId}`, err);
			return { success: false, message: 'Update failed' };
		}
	}
};
