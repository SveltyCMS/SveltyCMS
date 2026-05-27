/**
 * @file src/routes/api/scim/v2/Users/+server.ts
 * @description API endpoint for managing users via SCIM v2 protocol (RFC 7644)
 *
 * Features:
 * - Bearer Token + Session-based authentication
 * - GET All Users with SCIM filter support (eq, co, sw)
 * - POST Create User with Valibot validation
 * - SCIM-compliant error responses
 * - Audit logging
 */

import { auth } from '@src/databases/db';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { buildScimListResponse, buildScimUser, matchesScimFilter, parseScimFilter, scimError, validateScimAuth } from '@utils/scim-utils';

export const GET = apiHandler(async ({ url, locals, request }) => {
	// SCIM auth: Bearer token or admin session
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	try {
		if (!auth) {
			throw new AppError('Authentication service not available', 500, 'AUTH_UNAVAILABLE');
		}

		// Pagination parameters (RFC 7644 §3.4.2.4)
		const startIndex = Math.max(1, Number(url.searchParams.get('startIndex')) || 1);
		const count = Math.min(200, Math.max(1, Number(url.searchParams.get('count')) || 100));

		// Filter support (RFC 7644 §3.4.2.2)
		const filterString = url.searchParams.get('filter');
		const filters = parseScimFilter(filterString);

		// Fetch users from database
		const dbUsers = await auth.getAllUsers();

		// Apply SCIM filters
		const filteredUsers = dbUsers.filter((u: Record<string, any>) => matchesScimFilter(u, filters));
		const totalResults = filteredUsers.length;

		// Paginate
		const paginatedUsers = filteredUsers.slice(startIndex - 1, startIndex - 1 + count);

		// Map to SCIM format
		const resources = paginatedUsers.map((u: Record<string, any>) => buildScimUser(u, url.origin));

		return json(buildScimListResponse(resources, totalResults, startIndex));
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const error = e as Error;
		logger.error('SCIM Users GET error', { error: e });
		return scimError(500, error.message || 'Internal Server Error');
	}
});

export const POST = apiHandler(async ({ request, url, locals }) => {
	// SCIM auth: Bearer token or admin session
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	try {
		if (!auth) {
			throw new AppError('Authentication service not available', 500, 'AUTH_UNAVAILABLE');
		}

		const body = await request.json();

		// Validate required fields
		const email = body.userName || body.emails?.[0]?.value;
		if (!email) {
			return scimError(400, 'userName or emails[0].value is required', 'invalidValue');
		}

		// Validate email format
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return scimError(400, 'Invalid email format', 'invalidValue');
		}

		// Check for duplicate
		const existingUser = await auth.checkUser({ email });
		if (existingUser) {
			return scimError(409, 'User already exists', 'uniqueness');
		}

		// Create user
		const newUser = await auth.createUser({
			email,
			username: body.name?.givenName || body.displayName || email.split('@')[0],
			password: body.password || crypto.randomUUID(),
			role: 'user',
			permissions: [],
			isRegistered: true
		});

		if (!newUser) {
			throw new Error('Failed to create user');
		}

		logger.info('SCIM User created', { userId: newUser._id, email });
		return json(buildScimUser(newUser, url.origin), { status: 201 });
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const error = e as Error;
		logger.error('SCIM Users POST error', { error: e });
		return scimError(400, error.message || 'Invalid request', 'invalidSyntax');
	}
});
