/**
 * @file src/routes/api/user/editToken/+server.ts
 * @description API endpoint for editing a user token.
 *
 * This module provides functionality to:
 * - Update the data associated with a specific token
 *
 * Features:
 * - Token data modification
 * - Permission checking
 * - Input validation
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/editToken
 * Body: JSON object with 'tokenId' and 'newTokenData' properties
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, string, optional, email, type ValiError } from 'valibot';

const editTokenSchema = object({
	tokenId: string(),
	newTokenData: object({
		email: optional(email()),
		expires: optional(string()),
		type: optional(string()),
		role: optional(string()),
		user_id: optional(string())
	})
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to edit tokens
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'config/userManagement',
			name: 'Edit Token',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to edit registration tokens');
		}

		const body = await request.json();

		// Validate input
		const validatedData = editTokenSchema.parse(body);

		// Handle expires conversion if it exists
		if (validatedData.newTokenData.expires) {
			if (typeof validatedData.newTokenData.expires === 'string') {
				// Convert string format (e.g. '7d') to Date
				const unit = validatedData.newTokenData.expires.slice(-1);
				const value = parseInt(validatedData.newTokenData.expires.slice(0, -1));
				let hours = 168; // Default 7 days

				switch (unit) {
					case 'h':
						hours = value;
						break;
					case 'd':
						hours = value * 24;
						break;
				}

				const expires = new Date();
				expires.setHours(expires.getHours() + hours);
				validatedData.newTokenData.expires = expires;
			} else {
				validatedData.newTokenData.expires = new Date(validatedData.newTokenData.expires);
			}
		}

		const tokenAdapter = new TokenAdapter();

		// Update the token
		await tokenAdapter.updateToken(validatedData.tokenId, validatedData.newTokenData);

		logger.info('Token updated successfully', {
			tokenId: validatedData.tokenId,
			newData: validatedData.newTokenData
		});

		return json({
			success: true,
			message: 'Token updated successfully'
		});
	} catch (err) {
		if ((err as ValiError).issues) {
			const valiError = err as ValiError;
			logger.warn('Invalid input for editToken API:', valiError.issues);
			throw error(400, 'Invalid input: ' + valiError.issues.map((issue) => issue.message).join(', '));
		}
		logger.error('Error in editToken API:', err);
		throw error(500, 'Failed to update token');
	}
};
