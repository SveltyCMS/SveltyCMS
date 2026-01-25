/**
 * @file src/routes/api/user/verifyPassword/+server.ts
 * @description API endpoint for verifying a user's password.
 *
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { verifyPassword } from '@src/databases/auth';
import { logger } from '@utils/logger.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = locals;

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const { password } = await request.json();

	if (!password) {
		throw error(400, 'Password is required');
	}

	// Trim password to match how it's stored (passwordSchema uses trim())
	const trimmedPassword = password.trim();

	try {
		// Fetch full user to get the password hash
		const fullUser = await auth.getUserById(user._id);

		if (!fullUser || !fullUser.password) {
			logger.error(`VerifyPassword: User ${user._id} not found or has no password.`);
			throw error(500, 'User data unavailable');
		}

		logger.debug(`VerifyPassword: Checking password for user ${user._id}. Hash length: ${fullUser.password.length}`);
		const isValid = await verifyPassword(trimmedPassword, fullUser.password);
		logger.debug(`VerifyPassword: Result for ${user._id} is ${isValid}`);

		return json({ valid: isValid });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error(`Error verifying password: ${errorMessage}`, {
			stack: err instanceof Error ? err.stack : undefined,
			name: err instanceof Error ? err.name : undefined
		});
		throw error(500, 'Verification failed');
	}
};
