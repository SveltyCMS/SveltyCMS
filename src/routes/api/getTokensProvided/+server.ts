/**
 * @file src/routes/api/getTokensProvided/+server.ts
 * @description Server-side API endpoint to check available API tokens
 *
 * This endpoint returns which API tokens are configured without exposing the actual tokens.
 */

import { json } from '@sveltejs/kit';
import { config, getGoogleApiKey, getTwitchToken } from '@src/lib/config.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Initialize configuration service
		await config.initialize();

		const tokensProvided = {
			google: Boolean(await getGoogleApiKey()),
			twitch: Boolean(await getTwitchToken())
		};

		return json({
			tokensProvided
		});
	} catch (error) {
		console.error('Error checking tokens:', error);
		return json({ error: 'Failed to check available tokens' }, { status: 500 });
	}
};
