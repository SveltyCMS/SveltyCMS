/**
 * @file src/routes/(app)/user/+page.server.ts
 * @description Server-side logic for the user page in the application.
 *
 * This module handles the server-side operations for the user page, including:
 * - Form validation for adding users and changing passwords
 * - Preparing data for client-side rendering
 *
 * Features:
 * - User and role information retrieval from event.locals
 * - Form handling with Superforms
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles form validation for the client-side rendering.
 */
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import type { User, Role, Token } from '@src/auth/types';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { valibot } from 'sveltekit-superforms/adapters';

// System Logger
import { logger } from '@utils/logger.svelte';

// Import the PermissionConfig type
import type { PermissionConfig } from '@src/auth/permissionCheck';

// Utility function to mask email addresses
// const maskEmail = (email: string): string => {
//     if (!email) return '[NO_EMAIL]';
//     const parts = email.split('@');
//     if (parts.length !== 2) return '[INVALID_EMAIL]';
//     const [localPart, domain] = parts;
//     const maskedLocal = localPart.slice(0, 3) + '***';
//     return `${maskedLocal}@${domain}`;
// };

// Utility function to validate and convert a timestamp to ISO string
const safeDateFromTimestamp = (timestamp: unknown): string | null => {
    if (typeof timestamp === 'number' && !isNaN(timestamp)) {
        const date = new Date(timestamp);
        return date.toISOString();
    }
    return null;
};

export const load: PageServerLoad = async (event) => {
    try {
        const user: User | null = event.locals.user;
        const roles: Role[] = event.locals.roles || [];
        const isFirstUser: boolean = event.locals.isFirstUser;
        const hasManageUsersPermission: boolean = event.locals.hasManageUsersPermission;

        // Validate forms using SuperForms
        const addUserForm = await superValidate(event, valibot(addUserTokenSchema));
        const changePasswordForm = await superValidate(event, valibot(changePasswordSchema));

        // Prepare user object for return, ensuring _id is a string
        const safeUser = user
            ? {
                ...user,
                _id: user._id.toString(),
                password: '[REDACTED]' // Ensure password is not sent to client
            }
            : null;

        let adminData = null;

        if (user?.isAdmin || hasManageUsersPermission) {
            const allUsers: User[] = event.locals?.allUsers ?? [];
            const allTokens: Token[] = event.locals?.allTokens?.tokens ?? [];

            // Format users and tokens for the admin area
            const formattedUsers = allUsers.map((user) => ({
                _id: user._id.toString(),
                blocked: user.blocked || false,
                avatar: user.avatar || null,
                email: user.email,
                username: user.username || null,
                role: user.role,
                activeSessions: user.lastActiveAt ? 1 : 0, // Placeholder for active sessions
                lastAccess: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null,
                createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
                updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null
            }));

            const formattedTokens = allTokens.map((token) => ({
                user_id: token.user_id,
                blocked: false, // Assuming tokens don't have a 'blocked' status
                email: token.email || '',
                expiresIn: token.expires ? new Date(token.expires).toISOString() : null,
                createdAt: safeDateFromTimestamp(token.token_id), // Convert token_id to ISO string
                updatedAt: safeDateFromTimestamp(token.token_id) // Convert token_id to ISO string
            }));

            adminData = {
                users: formattedUsers,
                tokens: formattedTokens
            };

            // Mask sensitive data before logging
            // const maskedAdminData = {
            //     users: formattedUsers.map((user) => ({
            //         ...user,
            //         email: '[MASKED_EMAIL]', // Log placeholder instead of masked email
            //         avatar: '[MASKED_AVATAR]', // Mask avatar URL
            //     })),
            //     tokens: formattedTokens.map((token) => ({
            //         ...token,
            //         email: '[MASKED_EMAIL]', // Log placeholder instead of masked email
            //     }))
            // };

            // Log masked admin data
            logger.debug(`Admin data prepared: ${JSON.stringify(adminData)}`);
        }

        // Provide manageUsersPermissionConfig to the client
        const manageUsersPermissionConfig: PermissionConfig = {
            contextId: 'config/userManagement',
            requiredRole: 'admin',
            action: 'manage',
            contextType: 'system'
        };

        // Return data to the client
        return {
            user: safeUser,
            roles: roles.map((role) => ({
                ...role,
                _id: role._id.toString()
            })),
            addUserForm,
            changePasswordForm,
            isFirstUser,
            manageUsersPermissionConfig,
            adminData,
            permissions: {
                'config/adminArea': { hasPermission: user?.isAdmin || hasManageUsersPermission }
            }
        };
    } catch (err) {
        // Log error with an error code 
        logger.error('Error during load function (ErrorCode: USER_LOAD_500):', err);
        throw error(500, 'Internal Server Error');
    }
};
