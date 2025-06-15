/**
 * @file src/routes/api/user/deleteToken/+server.ts
 * @description API endpoint for deleting a single invitation token.
 *
 * This module provides functionality to:
 * - Delete a specific invitation token by token ID
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for token deletion.
 * - Single token deletion with proper validation
 * - Error handling and comprehensive logging
 *
 * Usage:
 * DELETE /api/user/deleteToken
 * Body: JSON object with 'tokenId' property
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
import { object, string, parse, type ValiError, minLength } from 'valibot';

// Define the expected shape of the request body for validation.
const deleteTokenSchema = object({
    tokenId: string([minLength(1, 'A token ID must be provided.')])
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
    try {
        // **SECURITY**: This endpoint now checks for a specific permission. Deleting a token
        const hasPermission = hasPermissionByAction(
            locals.user,
            'delete', // The action being performed
            'user',   // The context type
            'any',    // The scope (any user)
            locals.roles && locals.roles.length > 0 ? locals.roles : roles
        );

        if (!hasPermission) {
            logger.warn('Unauthorized attempt to delete a token', { userId: locals.user?._id });
            throw error(403, 'Forbidden: You do not have permission to delete tokens.');
        }

        const body = await request.json();

        // Validate the request body against the schema.
        const { tokenId } = parse(deleteTokenSchema, body);

        const tokenAdapter = new TokenAdapter();

        // Delete the specific token by ID
        const result = await tokenAdapter.deleteToken(tokenId);

        if (result) {
            logger.info('Invitation token deleted successfully', {
                tokenId: tokenId,
                deletedBy: locals.user?._id
            });

            return json({
                success: true,
                message: 'Invitation token deleted successfully.'
            });
        } else {
            logger.warn('Failed to delete token - token not found', {
                tokenId: tokenId,
                requestedBy: locals.user?._id
            });
            throw error(404, 'Token not found or already deleted.');
        }
    } catch (err) {
        // Handle specific validation errors from Valibot.
        if (err.name === 'ValiError') {
            const valiError = err as ValiError;
            const issues = valiError.issues.map((issue) => issue.message).join(', ');
            logger.warn('Invalid input for deleteToken API:', { issues });
            throw error(400, `Invalid input: ${issues}`);
        }

        // Handle all other errors, including HTTP errors from `throw error()`.
        const httpError = err as HttpError;
        const status = httpError.status || 500;
        const message = httpError.body?.message || 'An unexpected error occurred while deleting the token.';

        logger.error('Error in deleteToken API:', {
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
