/**
 * @file src/routes/api/setup/check-install/+server.ts
 * @description API endpoint to check if this is a fresh install by looking for private.ts
 *              and clear all cookies if it's a fresh install.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { join } from 'path';

import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ cookies, request }) => {
	try {
		// Check if private.ts exists (indicating this is not a fresh install)
		const privateTsPath = join(process.cwd(), 'src', 'auth', 'private.ts');
		const isFreshInstall = !existsSync(privateTsPath);

		if (isFreshInstall) {
			logger.info('Fresh install detected - clearing all cookies');

			// Get all cookies from the request headers (more comprehensive than cookies.getAll())
			const cookieHeader = request.headers.get('cookie');
			const cookieNames: string[] = [];

			if (cookieHeader) {
				// Parse all cookie names from the header
				cookieHeader.split(';').forEach((cookie) => {
					const [name] = cookie.trim().split('=');
					if (name) {
						cookieNames.push(name.trim());
					}
				});
			}

			// Also get cookies from SvelteKit's cookie store
			const svelteCookies = cookies.getAll();
			svelteCookies.forEach((cookie) => {
				if (!cookieNames.includes(cookie.name)) {
					cookieNames.push(cookie.name);
				}
			});

			// Clear all found cookies
			for (const cookieName of cookieNames) {
				cookies.set(cookieName, '', {
					path: '/',
					expires: new Date(0),
					httpOnly: false,
					secure: false,
					sameSite: 'lax'
				});
				logger.info(`Cleared cookie: ${cookieName}`);
			}

			logger.info(`Cleared ${cookieNames.length} cookies for fresh install`);
		} else {
			logger.info('Existing install detected - preserving cookies');
		}

		return json({
			success: true,
			isFreshInstall,
			message: isFreshInstall
				? `Fresh install detected, ${isFreshInstall ? 'cookies cleared' : 'cookies preserved'}`
				: 'Existing install detected, cookies preserved'
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		logger.error('Failed to check install status:', { error: errorMessage });
		return json({ success: false, error: 'Failed to check install status.' }, { status: 500 });
	}
};
