/**
 * @file src/routes/api/auth/2fa/verify-setup/+server.ts
 * @description API endpoint for completing 2FA setup by verifying the first TOTP code
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { getDefaultTwoFactorAuthService } from '@auth/twoFactorAuth';
import { auth } from '@databases/db';
import { object, string, array, parse } from 'valibot';

// Request body schema
const verifySetupSchema = object({
	secret: string(),
	verificationCode: string(),
	backupCodes: array(string())
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Ensure user is authenticated
		if (!locals.user) {
			logger.warn('Unauthorized 2FA setup verification attempt');
			throw error(401, 'Authentication required');
		}

		const user = locals.user;
		const tenantId = user.tenantId;

		// Check if 2FA is already enabled
		if (user.is2FAEnabled) {
			logger.warn('2FA setup verification attempted for user with 2FA already enabled', {
				userId: user._id,
				tenantId
			});
			throw error(400, '2FA is already enabled for this account');
		}

		// Parse and validate request body
		const body = await request.json();
		const validatedBody = parse(verifySetupSchema, body);

		// Complete 2FA setup
		const twoFactorService = getDefaultTwoFactorAuthService(auth);
		const success = await twoFactorService.complete2FASetup(
			user._id,
			validatedBody.secret,
			validatedBody.verificationCode,
			validatedBody.backupCodes,
			tenantId
		);

		if (!success) {
			logger.warn('2FA setup verification failed - invalid code', {
				userId: user._id,
				tenantId
			});
			throw error(400, 'Invalid verification code. Please try again.');
		}

		logger.info('2FA setup completed successfully', { userId: user._id, tenantId });

		return json({
			success: true,
			message: '2FA has been successfully enabled for your account. Please save your backup codes in a secure location.'
		});
	} catch (err) {
		const message = `2FA setup verification failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, 'Failed to complete 2FA setup');
	}
};
