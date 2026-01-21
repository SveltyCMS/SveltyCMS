/**
 * @file src/routes/api/scim/v2/Groups/+server.ts
 * @description API endpoint for managing groups (roles) via SCIM v2 protocol
 *
 * Features:
 * - Authorization Check (Admin only)
 * - Get All Roles
 * - Error Handling
 *
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SCIM_SCHEMAS } from '@src/types/scim';
import { auth } from '@src/databases/db';
import { logger } from '@utils/logger.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Security check
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Forbidden: Admin access required');
	}

	try {
		if (!auth) {
			throw error(500, 'Authentication service not available');
		}

		// Fetch roles from database
		const dbRoles = await auth.getAllRoles();
		const totalResults = dbRoles.length;

		// Map to SCIM format
		const resources = dbRoles.map((r) => ({
			schemas: [SCIM_SCHEMAS.GROUP],
			id: r._id,
			displayName: r.name,
			meta: {
				resourceType: 'Group',
				created: (r as any).createdAt || new Date().toISOString(),
				lastModified: (r as any).updatedAt || new Date().toISOString(),
				location: `${url.origin}/api/scim/v2/Groups/${r._id}`
			}
		}));

		return json({
			schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
			totalResults,
			itemsPerPage: resources.length,
			startIndex: 1,
			Resources: resources
		});
	} catch (e: any) {
		logger.error('SCIM Groups GET error', { error: e });
		return json(
			{
				schemas: [SCIM_SCHEMAS.ERROR],
				status: '500',
				detail: e.message || 'Internal Server Error'
			},
			{ status: 500 }
		);
	}
};
