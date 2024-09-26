/**
 * @file src/routes/api/user/logout/+server.ts
 * @description API endpoint for user logout
 *
 * This endpoint handles user logout by destroying the current session.
 * It requires the session token to be sent in the request body.
 *
 * @route POST /api/user/logout
 * @param {Object} request.body
 * @param {string} request.body.sessionToken - The current session token
 * @returns {Object} JSON response
 * @returns {boolean} response.success - Indicates if the logout was successful
 * @returns {string} response.message - Status message
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '@src/databases/db';

export const POST: RequestHandler = async ({ request }) => {
    const { sessionToken } = await request.json();

    if (!auth) {
        return json({ success: false, message: 'Authentication system unavailable' }, { status: 500 });
    }

    if (!sessionToken) {
        return json({ success: false, message: 'No session token provided' }, { status: 400 });
    }

    try {
        // Destroy the session
        await auth.destroySession(sessionToken);

        return json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        return json({ success: false, message: 'An error occurred during logout' }, { status: 500 });
    }
};