/**
 * @file src/routes/api/user/deleteUser/+server.ts
 * @description API endpoint for deleting a single user by their ID from the request body.
 *
 * This is a highly sensitive and destructive endpoint. It should only be
 * accessible to top-level administrators.
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for single user deletion.
 * - **Critical Safeguard #1**: Prevents an admin from deleting their own account.
 * - **Critical Safeguard #2**: Prevents the deletion of the last remaining admin.
 * - Input validation of the request body.
 * - Robust error handling and logging.
 *
 * Usage:
 * DELETE /api/user/deleteUser
 * Body: { "user_id": "some-user-id" }
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Auth and permission helpers
import { auth } from '@src/databases/db';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles'; // Import static roles for fallback

// System Logger and validation
import { logger } from '@utils/logger.svelte';
import { object, string, parse, type ValiError, minLength } from 'valibot';

// Define a schema for the incoming request body to validate the user_id.
const deleteUserSchema = object({
    user_id: string([minLength(1, 'A user_id must be provided.')])
});


export const DELETE: RequestHandler = async ({ request, locals }) => {
    try {
        // **SECURITY**: Requires a specific, high-privilege 'delete:user:any' permission.
        const hasPermission = hasPermissionByAction(
            locals.user,
            'delete', // The action
            'user',   // The context type
            'any',    // The scope
            locals.roles && locals.roles.length > 0 ? locals.roles : roles
        );

        if (!hasPermission) {
            logger.warn('Unauthorized attempt to delete a single user', {
                requestedBy: locals.user?._id
            });
            throw error(403, 'Forbidden: You do not have permission to delete users.');
        }

        if (!auth) {
            logger.error('Authentication system is not initialized');
            throw error(500, 'Internal Server Error: Auth system not initialized');
        }

        const body = await request.json();
        // Validate the request body to ensure a user_id is present.
        const { user_id: userIdToDelete } = parse(deleteUserSchema, body);


        // **CRITICAL SAFEGUARD #1**: Prevent an admin from deleting their own account.
        if (locals.user._id === userIdToDelete) {
            logger.warn('An administrator attempted to delete their own account.', { adminId: locals.user._id });
            throw error(400, 'You cannot delete your own user account.');
        }

        // **CRITICAL SAFEGUARD #2**: Prevent the deletion of the last administrator.
        const userToDelete = await auth.getUserById(userIdToDelete);
        if (!userToDelete) {
            throw error(404, 'The user you are trying to delete does not exist.');
        }

        // This check is only necessary if the user being deleted IS an admin.
        if (userToDelete.isAdmin) {
            const allUsers = await auth.getAllUsers();
            const adminCount = allUsers.filter(u => u.isAdmin).length;

            // If there's only one admin left in the system, we cannot delete them.
            if (adminCount <= 1) {
                logger.warn('Attempt to delete the last remaining admin was prevented.', {
                    targetAdminId: userIdToDelete,
                    requestedBy: locals.user?._id,
                });
                throw error(400, 'Cannot delete the last administrator. At least one must remain.');
            }
        }

        // If all safeguards pass, proceed with the deletion.
        await auth.deleteUser(userIdToDelete);
        logger.info('User deleted successfully', { deletedUserId: userIdToDelete, deletedBy: locals.user?._id });

        return json({
            success: true,
            message: 'User deleted successfully.'
        });
    } catch (err) {
        // Handle specific validation errors from Valibot.
        if (err.name === 'ValiError') {
            const valiError = err as ValiError;
            const issues = valiError.issues.map((issue) => issue.message).join(', ');
            logger.warn('Invalid input for deleteUser API:', { issues });
            throw error(400, `Invalid input: ${issues}`);
        }

        // Handle all other errors, including HTTP errors from `throw error()`.
        const httpError = err as HttpError;
        const status = httpError.status || 500;
        const message = httpError.body?.message || 'An unexpected error occurred while deleting the user.';

        logger.error('Error in single user delete API:', {
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

