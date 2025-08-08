/**
 * @file src/routes/api/auth/2fa/disable/+server.ts
 * @description API endpoint for disabling 2FA
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { getDefaultTwoFactorAuthService } from '@auth/twoFactorAuth';
import { auth } from '@databases/db';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		// Ensure user is authenticated
		if (!locals.user) {
			logger.warn('Unauthorized 2FA disable attempt');
			throw error(401, 'Authentication required');
		}

		const user = locals.user;
		const tenantId = user.tenantId;

		// Check if 2FA is enabled
		if (!user.is2FAEnabled) {
			logger.warn('2FA disable attempted for user without 2FA enabled', {
				userId: user._id,
				tenantId
			});
			throw error(400, '2FA is not enabled for this account');
		}

		// Disable 2FA
		const twoFactorService = getDefaultTwoFactorAuthService(auth);
		const success = await twoFactorService.disable2FA(user._id, tenantId);

		if (!success) {
			logger.error('Failed to disable 2FA', { userId: user._id, tenantId });
			throw error(500, 'Failed to disable 2FA');
		}

		logger.info('2FA disabled successfully', { userId: user._id, tenantId });

		return json({
			success: true,
			message: '2FA has been disabled for your account.'
		});
	} catch (err) {
		const message = `2FA disable failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, 'Failed to disable 2FA');
	}
};
