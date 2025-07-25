/**
 * @file src/routes/api/dashboard/userActivity/+server.ts
 * @description API endpoint for user activity data for dashboard widgets
 *
 * ### Features
 * - **Secure Authorization:** Access is controlled centrally by `src/hooks.server.ts`.
 * - **Data Transformation:** Fetches the latest registered users for the current tenant and transforms the data for the widget.
 * - **Guaranteed Data Shape:** Uses runtime validation to ensure a consistent API response.
 * - **Multi-Tenant Safe:** All data lookups are scoped to the current tenant.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

// Auth / Permissions
import { auth } from '@src/databases/db';
import { checkApiPermission } from '@api/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Validation
import * as v from 'valibot';

// --- Schema for the outgoing API data ---
const UserActivitySchema = v.object({
	id: v.string(),
	email: v.pipe(v.string(), v.email()),
	role: v.string(),
	isRegistered: v.boolean(),
	lastLogin: v.nullable(v.date()),
	createdAt: v.nullable(v.date()),
	status: v.enum(['active', 'pending'])
});

// Infer the TypeScript type from the schema for internal use
type UserActivity = v.Output<typeof UserActivitySchema>;

// --- API Handler ---

export const GET: RequestHandler = async ({ locals }) => {
	const { user, tenantId } = locals; // Check dashboard permissions
	const permissionResult = await checkApiPermission(user, {
		resource: 'dashboard',
		action: 'read'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to access user activity data', {
			userId: user?._id,
			error: permissionResult.error
		});
		throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
	} // Initial Check for Auth

	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error: Auth service unavailable.');
	}

	try {
		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		// --- MULTI-TENANCY: Scope the query by tenantId ---
		const filter = privateEnv.MULTI_TENANT ? { tenantId } : {}; // Fetch Data

		const recentUsers = await auth.getAllUsers({
			filter,
			limit: 10,
			sort: { createdAt: -1 }
		}); // Transform and Validate Data

		const activityData: UserActivity[] = recentUsers.map((user) => ({
			id: user._id.toString(),
			email: user.email,
			role: user.role,
			isRegistered: user.isRegistered,
			lastLogin: user.lastLogin || null,
			createdAt: user.createdAt || null,
			status: user.isRegistered ? 'active' : 'pending'
		})); // This parse step ensures our transformation is correct

		const validatedData = v.parse(v.array(UserActivitySchema), activityData);

		logger.info('User activity data fetched successfully', {
			count: validatedData.length,
			requestedBy: user?._id,
			tenantId
		});

		return json(validatedData); // Return Response
	} catch (err) {
		// Catch validation errors specifically
		if (err instanceof v.ValiError) {
			logger.error('User activity data failed validation after transformation', { error: err.issues });
			throw error(500, 'Internal Server Error: Could not prepare user activity data.');
		} // Catch all other errors

		const httpError = err as { status?: number; message?: string };
		logger.error('An unexpected error occurred fetching user activity:', {
			error: httpError.message,
			status: httpError.status
		});
		throw error(httpError.status || 500, httpError.message || 'An unexpected error occurred.');
	}
};
