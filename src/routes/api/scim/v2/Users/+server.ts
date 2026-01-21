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

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SCIM_SCHEMAS } from '@src/types/scim';
import { auth } from '@src/databases/db';
import { logger } from '@utils/logger.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Security check: Administrative access required for SCIM
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Forbidden: Admin access required');
	}

	try {
		if (!auth) {
			throw error(500, 'Authentication service not available');
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
				created: (u as any).createdAt || new Date().toISOString(),
				lastModified: (u as any).updatedAt || new Date().toISOString(),
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
	} catch (e: any) {
		logger.error('SCIM Users GET error', { error: e });
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

export const POST: RequestHandler = async ({ request, url, locals }) => {
	// Security check
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Forbidden: Admin access required');
	}

	try {
		if (!auth) {
			throw error(500, 'Authentication service not available');
		}

		const body = await request.json();
		const { userName, emails, password } = body;

		// Extract email
		const email = userName || (emails && emails[0]?.value);
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
	} catch (e: any) {
		logger.error('SCIM Users POST error', { error: e });
		return json(
			{
				schemas: [SCIM_SCHEMAS.ERROR],
				status: '400',
				scimType: 'invalidSyntax',
				detail: e.message || 'Invalid JSON'
			},
			{ status: 400 }
		);
	}
};
