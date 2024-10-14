import { dev } from '$app/environment';

import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

import { google } from 'googleapis';
let googleAuthClient: any = null;
// System Logger
import { logger } from '@utils/logger';

async function googleAuth() {
	if (googleAuthClient) return googleAuthClient;

	if (privateEnv.GOOGLE_CLIENT_ID && privateEnv.GOOGLE_CLIENT_SECRET) {
		logger.debug('Setting up Google OAuth2...');
		googleAuthClient = new google.auth.OAuth2(
			privateEnv.GOOGLE_CLIENT_ID,
			privateEnv.GOOGLE_CLIENT_SECRET,
			`${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
		);
		return googleAuthClient;
	} else {
		logger.warn('Google client ID and secret not provided. Google OAuth will not be available.');
		return null;
	}
}

export { googleAuth }