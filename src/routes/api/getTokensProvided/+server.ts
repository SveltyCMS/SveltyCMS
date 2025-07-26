/**
 * @file src/routes/api/getTokensProvided/+server.ts
 * @description API endpoint for checking the availability of external service tokens.
 *
 * This module provides functionality to:
 * - Check if API keys/tokens are provided for Google, Twitch, and TikTok
 * - Return a JSON object indicating which tokens are available
 *
 * Features:
 * - Environment-based token availability check
 * - Logging of token availability status
 *
 * Usage:
 * GET /api/getTokensProvided
 * Returns: JSON object with boolean values for each service token
 * Requires: Admin authentication or system permissions
 */

import { privateEnv } from '@root/config/private';
import { json, type RequestHandler } from '@sveltejs/kit';

// Permissions

// System Logger
import { logger } from '@utils/logger.svelte';

interface TokenStatus {
	google: boolean;
	twitch: boolean;
	tiktok: boolean;
}

export const GET: RequestHandler = async () => {
	// No permission checks needed - hooks already verified:
	// 1. User is authenticated
	// 2. User has correct role for this API endpoint
	// 3. User belongs to correct tenant (if multi-tenant)

	logger.debug('Checking provided tokens...');

	const tokensProvided: TokenStatus = {
		google: Boolean(privateEnv.GOOGLE_API_KEY),
		twitch: Boolean(privateEnv.TWITCH_TOKEN),
		tiktok: Boolean(privateEnv.TIKTOK_TOKEN)
	};

	Object.entries(tokensProvided).forEach(([service, isProvided]) => {
		logger.debug(`${service} token is ${isProvided ? 'provided' : 'not provided'}.`);
	});

	logger.info('Tokens provided status', tokensProvided);

	return json(tokensProvided);
};
