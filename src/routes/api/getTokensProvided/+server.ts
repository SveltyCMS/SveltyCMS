import { json, type RequestHandler } from '@sveltejs/kit';
import { GOOGLE_API_TOKEN, TWITCH_TOKEN } from '$env/static/private';

export const GET: RequestHandler = async () => {
	var tokensProvided = {
		google: false,
		twitch: false
	};
	if (GOOGLE_API_TOKEN) {
		tokensProvided.google = true;
	}
	if (TWITCH_TOKEN) {
		tokensProvided.twitch = true;
	}

	return json({});
};
