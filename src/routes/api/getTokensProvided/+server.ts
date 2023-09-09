import { json, type RequestHandler } from '@sveltejs/kit';
import {
	SECRET_GOOGLE_API_KEY,
	SECRET_TWITCH_TOKEN,
	SECRET_TIKTOK_TOKEN
} from '$env/static/private';

export const GET: RequestHandler = async () => {
	// Initialize tokensProvided object
	const tokensProvided = {
		google: false,
		twitch: false,
		tiktok: false
	};

	// Check if API keys/tokens are provided and update tokensProvided object accordingly
	if (SECRET_GOOGLE_API_KEY) {
		tokensProvided.google = true;
	}
	if (SECRET_TWITCH_TOKEN) {
		tokensProvided.twitch = true;
	}
	if (SECRET_TIKTOK_TOKEN) {
		tokensProvided.tiktok = true;
	}

	// Return tokensProvided object as JSON response
	return json({});
};
