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

import { auth } from '@src/databases/db';
import { SCIM_SCHEMAS } from '@src/types/scim';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ url, locals }) => {
	// Security check
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Forbidden: Admin access required', 403, 'FORBIDDEN');
	}

	try {
		if (!auth) {
			throw new AppError('Authentication service not available', 500, 'AUTH_UNAVAILABLE');
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
				created: (r as { createdAt?: string }).createdAt || new Date().toISOString(),
				lastModified: (r as { updatedAt?: string }).updatedAt || new Date().toISOString(),
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
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const error = e as Error;
		logger.error('SCIM Groups GET error', { error: e });
		return json(
			{
				schemas: [SCIM_SCHEMAS.ERROR],
				status: '500',
				detail: error.message || 'Internal Server Error'
			},
			{ status: 500 }
		);
	}
});
