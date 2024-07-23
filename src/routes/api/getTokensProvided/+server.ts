import { privateEnv } from '@root/config/private';
import { json, type RequestHandler } from '@sveltejs/kit';

// System Logs
import { logger } from '@src/utils/logger';

export const GET: RequestHandler = async () => {
	// Initialize tokensProvided object
	const tokensProvided = {
		google: false,
		twitch: false,
		tiktok: false
	};

	logger.debug('Checking provided tokens...');

	// Check if API keys/tokens are provided and update tokensProvided object accordingly
	if (privateEnv.GOOGLE_API_KEY) {
		tokensProvided.google = true;
		logger.debug('Google API key is provided.');
	}
	if (privateEnv.TWITCH_TOKEN) {
		tokensProvided.twitch = true;
		logger.debug('Twitch token is provided.');
	}
	if (privateEnv.TIKTOK_TOKEN) {
		tokensProvided.tiktok = true;
		logger.debug('TikTok token is provided.');
	}

	// Log the tokens provided status
	logger.info('Tokens provided status', tokensProvided);

	// Return tokensProvided object as JSON response
	return json(tokensProvided);
};
