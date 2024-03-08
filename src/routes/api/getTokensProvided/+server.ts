import { privateEnv } from '@root/config/private';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	// Initialize tokensProvided object
	const tokensProvided = {
		google: false,
		twitch: false,
		tiktok: false
	};

	// Check if API keys/tokens are provided and update tokensProvided object accordingly
	if (privateEnv.GOOGLE_API_KEY) {
		tokensProvided.google = true;
	}
	if (privateEnv.TWITCH_TOKEN) {
		tokensProvided.twitch = true;
	}
	if (privateEnv.TIKTOK_TOKEN) {
		tokensProvided.tiktok = true;
	}

	// Return tokensProvided object as JSON response
	return json({});
};
