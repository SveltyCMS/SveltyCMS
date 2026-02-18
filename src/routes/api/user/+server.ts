/**
 * @file src/routes/api/user/index.ts
 * @description API endpoints for user management.
 *
 * This module provides functionality to:
 * - Retrieve all users for the current tenant (GET)
 * - Create a new user within the current tenant and send a token via email (POST)
 *
 * Features:
 * - **Defense in Depth**: Specific permission checks for both GET and POST.
 * - User creation with role assignment and email notification.
 * - Form validation
 * - Error handling and logging.
 *
 * Usage:
 * GET /api/user - Retrieve all users (requires 'read:user:all' permission)
 * POST /api/user - Create a new user (requires 'create:user:any' permission)
 */
import { auth, dbAdapter } from '@src/databases/db';
import type { ISODateString } from '@src/databases/dbInterface';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { type HttpError, json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { addUserTokenSchema } from '@utils/formSchemas';
// System Logger
import { logger } from '@utils/logger.server';
import { safeParse } from 'valibot';

export const GET = apiHandler(async ({ url, locals }) => {
	const { user, tenantId, hasManageUsersPermission } = locals;

	// Security: Ensure the user is authenticated and has admin-level permissions.
	if (!(user && hasManageUsersPermission)) {
		throw new AppError('Forbidden: You do not have permission to access users.', 403, 'FORBIDDEN');
	}

	if (!(auth && dbAdapter)) {
		throw new AppError('Authentication system is not initialized', 500, 'AUTH_SYS_ERROR');
	}

	try {
		const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
		const limit = Number.parseInt(url.searchParams.get('limit') || '10', 10);
		const sort = url.searchParams.get('sort') || 'createdAt';
		const order = url.searchParams.get('order') === 'asc' ? 1 : -1;
		const search = url.searchParams.get('search') || '';

		// Build filter for database query
		const filter: Record<string, unknown> = {};

		// Apply tenant ID if in multi-tenant mode
		if (getPrivateSettingSync('MULTI_TENANT') && tenantId) {
			filter.tenantId = tenantId;
		}

		// Add search query if provided (MongoDB-style query)
		if (search) {
			filter.$or = [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
		}

		// Build pagination options for the adapter
		const options = {
			filter,
			limit,
			offset: (page - 1) * limit,
			sort: { [sort]: order === 1 ? 'asc' : 'desc' } as { [key: string]: 'asc' | 'desc' }
		};

		// Use the database adapter directly for full pagination support
		const usersResult = await dbAdapter.auth.getAllUsers(options);
		const totalUsersResult = await dbAdapter.auth.getUserCount(filter);

		if (!(usersResult.success && usersResult.data)) {
			throw new AppError('Failed to fetch users from database', 500, 'DB_FETCH_ERROR');
		}

		if (!totalUsersResult.success || totalUsersResult.data === undefined) {
			throw new AppError('Failed to get user count from database', 500, 'DB_COUNT_ERROR');
		}

		const users = usersResult.data;
		const totalUsers = totalUsersResult.data;

		logger.info('Users retrieved successfully', {
			count: users.length,
			total: totalUsers,
			requestedBy: user._id,
			tenantId
		});

		return json({
			success: true,
			data: users,
			pagination: {
				page,
				limit,
				totalItems: totalUsers,
				totalPages: Math.ceil(totalUsers / limit)
			}
		});
	} catch (err: unknown) {
		if (err instanceof AppError) {
			throw err;
		}
		logger.error('Error fetching users:', err);
		const errorMessage = err instanceof Error ? err.message : 'An internal server error occurred.';
		throw new AppError(errorMessage, 500, 'INTERNAL_SERVER_ERROR');
	}
});

export const POST = apiHandler(async ({ request, locals, url }) => {
	const { user, tenantId } = locals;
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw new AppError('Internal Server Error', 500, 'AUTH_SYS_ERROR');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_REQUIRED');
		} // **SECURITY**: Authentication is handled by hooks.server.ts - user presence confirms access

		const formData = await request.json();
		const result = safeParse(addUserTokenSchema, formData);
		if (!result.success) {
			logger.warn('Invalid form data for user creation', { issues: result.issues });
			throw new AppError('Invalid form data', 400, 'VALIDATION_ERROR');
		}

		const { email, role, expiresIn } = result.output;
		logger.info('Request to create user received', { email, role, requestedBy: user?._id, tenantId });

		const expirationTimes: Record<string, number> = {
			'2 hrs': 7200,
			'12 hrs': 43_200,
			'2 days': 172_800,
			'1 week': 604_800
		};

		const expirationTime = expirationTimes[expiresIn];
		if (!expirationTime) {
			logger.warn('Invalid value for token validity', { expiresIn, tenantId });
			throw new AppError('Invalid value for token validity', 400, 'INVALID_EXPIRATION');
		}

		const checkCriteria: { email: string; tenantId?: string } = { email };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			checkCriteria.tenantId = tenantId;
		}
		const existingUser = await auth.checkUser(checkCriteria);
		if (existingUser) {
			logger.warn('Attempted to create a user that already exists in this tenant', { email, tenantId });
			throw new AppError('User already exists in this tenant', 409, 'USER_EXISTS');
		}

		const newUser = await auth.createUser({
			email,
			role,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId })
		});
		const expiresAt = new Date(Date.now() + expirationTime * 1000);
		const token = await auth.createToken({
			user_id: newUser._id,
			expires: expiresAt.toISOString() as ISODateString,
			type: 'user-invite',
			tenantId
		});

		logger.info('User created successfully', { userId: newUser._id, tenantId }); // Send token via email. Pass the request origin for server-side fetch.

		await sendUserToken(url.origin, email, token, role, expirationTime);

		return json(newUser, { status: 201 }); // 201 Created
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const errMsg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
		const message = httpError.body?.message || `Error creating user: ${errMsg}`;
		logger.error('Error creating user', { error: message, status, tenantId });
		throw new AppError(message, status, 'USER_CREATION_FAILED');
	}
});

/**
 * Sends a user token via the sendMail API.
 * @param origin - The origin of the request (e.g., 'http://localhost:5173') for server-side fetch.
 */
async function sendUserToken(origin: string, email: string, token: string, role: string, expiresIn: number) {
	try {
		const inviteLink = `${origin}/login?invite_token=${token}`;
		const { getPrivateSettingSync } = await import('@src/services/settingsService');
		const internalKey = getPrivateSettingSync('JWT_SECRET_KEY');

		const response = await fetch(`${origin}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-internal-key': internalKey || ''
			},
			body: JSON.stringify({
				email,
				subject: 'You have been invited to join',
				message: 'User Token',
				templateName: 'userToken',
				props: {
					role,
					tokenLink: inviteLink,
					expiresInLabel: expiresIn
				}
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(`Failed to send email: ${response.statusText} - ${errorBody}`);
		}

		logger.info('User token email sent successfully', { email });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
		logger.error('Error sending user token email', { error: errMsg, email });
		throw err;
	}
}
