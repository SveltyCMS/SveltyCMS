/**
 * @file src/routes/api/user/deleteToken/+server.ts
 * @description API endpoint for deleting a single token.
 *
 * This module provides functionality to:
 * - Delete a specific token by token value
 *
 * Features:
 * - Single token deletion
 * - Permission checking
 * - Input validation
 * - Error handling and logging
 *
 * Usage:
 * DELETE /api/user/deleteToken
 * Body: JSON object with 'token' property
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, string, type ValiError } from 'valibot';

const deleteTokenSchema = object({
    token: string()
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
    try {
        // Check if user is authenticated
        if (!locals.user) {
            throw error(401, 'Authentication required');
        }

        // Check if the user has permission to delete tokens
        const hasPermission = hasPermissionByAction(
            locals.user,
            'manage',
            'system',
            'config/userManagement'
        );

        if (!hasPermission) {
            throw error(403, 'Unauthorized to delete tokens');
        }

        const body = await request.json();

        // Validate input
        const validatedData = deleteTokenSchema.parse(body);

        const tokenAdapter = new TokenAdapter();

        // Delete the specific token
        const result = await tokenAdapter.consumeToken(validatedData.token);

        if (result.status) {
            logger.info('Token deleted successfully', {
                token: validatedData.token
            });

            return json({
                success: true,
                message: 'Token deleted successfully'
            });
        } else {
            logger.warn('Failed to delete token', {
                token: validatedData.token,
                message: result.message
            });

            throw error(400, result.message);
        }
    } catch (err) {
        if ((err as ValiError).issues) {
            const valiError = err as ValiError;
            logger.warn('Invalid input for deleteToken API:', valiError.issues);
            throw error(400, 'Invalid input: ' + valiError.issues.map((issue) => issue.message).join(', '));
        }
        logger.error('Error in deleteToken API:', err);
        throw error(500, 'Failed to delete token');
    }
};
