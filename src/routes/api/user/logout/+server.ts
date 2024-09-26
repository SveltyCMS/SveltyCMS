/**
 * @file src/routes/api/user/logout/+server.ts
 * @description API endpoint for user logout
 *
 * This endpoint handles user logout by destroying all active sessions for the user.
 * It requires the user_id to be sent in the request body.
 *
 * @route POST /api/user/logout
 * @param {Object} request.body
 * @param {string} request.body.user_id - The ID of the user logging out
 * @returns {Object} JSON response
 * @returns {boolean} response.success - Indicates if the logout was successful
 * @returns {string} response.message - Status message
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '@src/databases/db';

export const POST: RequestHandler = async ({ request }) => {
    const { user_id } = await request.json();

    if (!auth) {
        return json({ success: false, message: 'Authentication system unavailable' }, { status: 500 });
    }

    if (!user_id) {
        return json({ success: false, message: 'No user ID provided' }, { status: 400 });
    }

    try {
        // Destroy all sessions for the user
        await auth.destroyAllUserSessions(user_id);

        return json({ success: true, message: 'Logged out successfully from all sessions' });
    } catch (error) {
        console.error('Logout error:', error);
        return json({ success: false, message: 'An error occurred during logout' }, { status: 500 });
    }
};