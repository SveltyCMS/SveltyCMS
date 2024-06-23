import type { RequestHandler } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';

// System logs
import logger from '@src/utils/logger';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();

		// Get all users to find admin count
		if (!auth) {
			throw new Error('Auth is not initialized');
		}

		const users = await auth.getAllUsers();
		const adminCount = users.filter((user) => user.role === 'admin').length;

		let remainingAdminCount = adminCount;
		let flag = false;

		for (const user of data) {
			if (user.role === 'admin' && remainingAdminCount === 1) {
				flag = true;
				break;
			}
			if (user.role === 'admin') {
				remainingAdminCount -= 1;
			}

			// Invalidate all sessions and block the user
			await auth.invalidateAllUserSessions(user.id);
			await auth.updateUserAttributes(user.id, { blocked: true });
		}

		if (flag) {
			logger.warn('Attempt to block the last remaining admin.');
			return new Response(JSON.stringify({ success: false, message: 'Cannot block all admins' }), { status: 400 });
		}

		logger.info('Users blocked successfully.');
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Error blocking users: ${err.message}`);
		return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500 });
	}
};
