/**
 * @file src/routes/api/auth/2fa/verify/+server.ts
 * @description API endpoint for verifying 2FA codes during authentication
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { getDefaultTwoFactorAuthService } from '@auth/twoFactorAuth';
import { auth } from '@databases/db';
import { object, string, parse } from 'valibot';

// Request body schema
const verifySchema = object({
	userId: string(),
	code: string()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// This endpoint can be used during login flow, so user might not be fully authenticated yet
		// The userId will be provided in the request body for verification

		// Parse and validate request body
		const body = await request.json();
		const validatedBody = parse(verifySchema, body);

		// Get tenant ID from locals if available
		const tenantId = locals.user?.tenantId;

		// Verify 2FA code
		const twoFactorService = getDefaultTwoFactorAuthService(auth);
		const result = await twoFactorService.verify2FA(validatedBody.userId, validatedBody.code, tenantId);

		if (!result.success) {
			logger.warn('2FA verification failed', {
				userId: validatedBody.userId,
				tenantId,
				reason: result.message
			});

			return json({
				success: false,
				message: result.message
			});
		}

		logger.info('2FA verification successful', {
			userId: validatedBody.userId,
			tenantId,
			method: result.method,
			backupCodeUsed: result.backupCodeUsed
		});

		return json({
			success: true,
			message: result.message,
			method: result.method,
			backupCodeUsed: result.backupCodeUsed
		});
	} catch (err) {
		const message = `2FA verification failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, 'Failed to verify 2FA code');
	}
};
