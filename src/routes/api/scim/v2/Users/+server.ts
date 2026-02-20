/**
 * @file src/routes/api/scim/v2/Users/+server.ts
 * @description API endpoint for managing users via SCIM v2 protocol
 *
 * Features:
 * - Authorization Check (Admin only)
 * - Get All Users
 * - Error Handling
 *
 */

import { auth } from '@src/databases/db';
import { SCIM_SCHEMAS } from '@src/types/scim';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ url, locals }) => {
	// Security check: Administrative access required for SCIM
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Forbidden: Admin access required', 403, 'FORBIDDEN');
	}

	try {
		if (!auth) {
			throw new AppError('Authentication service not available', 500, 'AUTH_ unavailable');
		}

		// Pagination parameters
		const startIndex = Number(url.searchParams.get('startIndex')) || 1;
		const count = Number(url.searchParams.get('count')) || 10;

		// Fetch users from database
		const dbUsers = await auth.getAllUsers();
		const totalResults = dbUsers.length;

		// Map to SCIM format
		const resources = dbUsers.slice(startIndex - 1, startIndex - 1 + count).map((u) => ({
			schemas: [SCIM_SCHEMAS.USER],
			id: u._id,
			userName: u.email,
			name: {
				formatted: u.username,
				familyName: '',
				givenName: u.username
			},
			active: true,
			emails: [{ value: u.email, type: 'work', primary: true }],
			meta: {
				resourceType: 'User',
				created: (u as { createdAt?: string }).createdAt || new Date().toISOString(),
				lastModified: (u as { updatedAt?: string }).updatedAt || new Date().toISOString(),
				location: `${url.origin}/api/scim/v2/Users/${u._id}`
			}
		}));

		return json({
			schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
			totalResults,
			itemsPerPage: resources.length,
			startIndex,
			Resources: resources
		});
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const error = e as Error;
		logger.error('SCIM Users GET error', { error: e });
		// SCIM Error Format
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

export const POST = apiHandler(async ({ request, url, locals }) => {
	// Security check
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Forbidden: Admin access required', 403, 'FORBIDDEN');
	}

	try {
		if (!auth) {
			throw new AppError('Authentication service not available', 500, 'AUTH_UNAVAILABLE');
		}

		const body = await request.json();
		const { userName, emails, password } = body;

		// Extract email
		const email = userName || emails?.[0]?.value;
		if (!email) {
			return json(
				{
					schemas: [SCIM_SCHEMAS.ERROR],
					status: '400',
					scimType: 'invalidValue',
					detail: 'Email/UserName is required'
				},
				{ status: 400 }
			);
		}

		// Check if user already exists
		const existingUser = await auth.checkUser({ email });
		if (existingUser) {
			return json(
				{
					schemas: [SCIM_SCHEMAS.ERROR],
					status: '409',
					scimType: 'uniqueness',
					detail: 'User already exists'
				},
				{ status: 409 }
			);
		}

		// Create user in database
		const newUser = await auth.createUser({
			email,
			username: body.name?.givenName || email.split('@')[0],
			password: password || crypto.randomUUID(), // SCIM usually provides password or it's handled via SSO
			role: 'user',
			permissions: [],
			isRegistered: true
		});

		if (!newUser) {
			throw new Error('Failed to create user');
		}

		return json(
			{
				schemas: [SCIM_SCHEMAS.USER],
				id: newUser._id,
				userName: newUser.email,
				active: true,
				meta: {
					resourceType: 'User',
					created: new Date().toISOString(),
					lastModified: new Date().toISOString(),
					location: `${url.origin}/api/scim/v2/Users/${newUser._id}`
				}
			},
			{ status: 201 }
		);
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const error = e as Error;
		logger.error('SCIM Users POST error', { error: e });
		return json(
			{
				schemas: [SCIM_SCHEMAS.ERROR],
				status: '400',
				scimType: 'invalidSyntax',
				detail: error.message || 'Invalid JSON'
			},
			{ status: 400 }
		);
	}
});
