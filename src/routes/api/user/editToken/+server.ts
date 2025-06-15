/**
 * @file src/routes/api/user/editToken/+server.ts
 * @description API endpoint for editing a user invitation token.
 *
 * This module provides functionality to:
 * - Update the data associated with a specific token (e.g., role or expiration).
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for token modification.
 * - **Secure Validation**: A restrictive schema ensures only editable fields are accepted.
 * - Token data modification.
 * - Error handling and logging.
 *
 * Usage:
 * PUT /api/user/editToken
 * Body: JSON object with 'tokenId' and 'newTokenData' properties
 */

import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles'; // Import static roles for fallback

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, string, optional, parse, type ValiError, minLength, picklist } from 'valibot';

// Define the allowed expiration values for consistency with the creation endpoint.
const allowedExpirationValues = ['2 hrs', '12 hrs', '2 days', '1 week'] as const;

// Securely validate the incoming data
const editTokenSchema = object({
	tokenId: string([minLength(1, 'A token ID must be provided.')]),
	newTokenData: object({
		role: optional(string([minLength(1, 'Role ID cannot be empty.')])),
		expires: optional(picklist(allowedExpirationValues, 'Invalid expiration value provided.'))
	})
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		// **SECURITY**: This endpoint now checks for a specific permission.
		const hasPermission = hasPermissionByAction(
			locals.user,
			'update', // The action being performed
			'user',   // The context type
			'any',    // The scope
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to edit a token', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to edit tokens.');
		}

		const body = await request.json();

		// Validate the incoming data against our restrictive schema.
		const { tokenId, newTokenData } = parse(editTokenSchema, body);

		// If there's nothing to update, return an error.
		if (Object.keys(newTokenData).length === 0) {
			throw error(400, 'No data provided to update.');
		}

		const dataToUpdate: { role?: string; expires?: Date } = {};

		// If a new role is provided, validate it exists.
		if (newTokenData.role) {
			const roleExists = roles.some(r => r._id === newTokenData.role);
			if (!roleExists) {
				throw error(400, 'The provided role ID is invalid.');
			}
			dataToUpdate.role = newTokenData.role;
		}

		// If a new expiration is provided, calculate the new Date object.
		if (newTokenData.expires) {
			const expirationInSeconds: Record<string, number> = {
				'2 hrs': 7200, '12 hrs': 43200, '2 days': 172800, '1 week': 604800
			};
			const seconds = expirationInSeconds[newTokenData.expires];
			dataToUpdate.expires = new Date(Date.now() + seconds * 1000);
		}

		const tokenAdapter = new TokenAdapter();

		// Update the token with the sanitized and validated data.
		const updatedToken = await tokenAdapter.updateToken(tokenId, dataToUpdate);

		if (!updatedToken) {
			throw error(404, 'Token not found or could not be updated.');
		}

		logger.info('Token updated successfully', {
			tokenId: tokenId,
			updatedData: dataToUpdate,
			updatedBy: locals.user?._id
		});

		return json({
			success: true,
			message: 'Token updated successfully.',
			token: updatedToken
		});
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for editToken API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		// Handle all other errors, including HTTP errors from `throw error()`.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while updating the token.';

		logger.error('Error in editToken API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});

		return json(
			{
				success: false,
				message: status === 500 ? 'Internal Server Error' : message
			},
			{ status }
		);
	}
};
