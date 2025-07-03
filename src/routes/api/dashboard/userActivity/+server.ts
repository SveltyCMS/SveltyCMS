/**
 * @file src/routes/api/userActivity/+server.ts
 * @description API endpoint for user activity data for dashboard widgets
 */

import { roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/auth/permissions';
import { auth } from '@src/databases/db';
import { error, json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Check if user has permission for dashboard access
		const hasPermission = hasPermissionByAction(
			locals.user,
			'access',
			'system',
			'dashboard',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to access user activity', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to access user activity data.');
		}

		// Get recent users for activity display
		const users = await auth.getAllUsers({ limit: 10 });

		// Transform user data for activity display
		const activityData = users.map((user) => ({
			id: user._id,
			email: user.email,
			role: user.role,
			isRegistered: user.isRegistered,
			lastLogin: user.lastLogin || null,
			createdAt: user.createdAt || null,
			status: user.isRegistered ? 'active' : 'pending'
		}));

		logger.info('User activity data fetched successfully', {
			count: activityData.length,
			requestedBy: locals.user?._id
		});

		return json(activityData);
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching user activity:', { error: message, status });
		throw error(status, message);
	}
};
