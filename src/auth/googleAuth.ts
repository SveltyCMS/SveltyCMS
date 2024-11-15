/**
 * @file src/auth/googleAuth.ts
 * @description Utility functions for Google OAuth.
 *
 * This module provides:
 * - Google OAuth client initialization
 * - Google OAuth client setup
 */

import { dev } from '$app/environment';
import { privateEnv } from '@root/config/private';
import { publicEnv } from '@root/config/public';

// System Logger
import { logger } from '../utils/logger';

// Google OAuth
let googleAuthClient: any = null;

// Initialize Google OAuth client with ID, secret, and redirect URL
async function googleAuth() {
	if (!privateEnv.GOOGLE_CLIENT_ID || !privateEnv.GOOGLE_CLIENT_SECRET) {
		logger.warn('Google client ID and secret are not provided. OAuth unavailable.');
		return null;
	}

	try {
		if (!googleAuthClient) {
			logger.debug('Setting up Google OAuth2...');
			const { google } = await import('googleapis');
			const redirectUri = `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`;
			logger.debug(`Using OAuth redirect URI: ${redirectUri}`);
			
			googleAuthClient = new google.auth.OAuth2(
				privateEnv.GOOGLE_CLIENT_ID,
				privateEnv.GOOGLE_CLIENT_SECRET,
				redirectUri
			);
		}

		return googleAuthClient;
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Unknown error initializing Google OAuth client';
		logger.error('Error initializing Google OAuth client:', error);
		return null;
	}
}

// Set credentials for the OAuth client
function setCredentials(credentials: any) {
	if (googleAuthClient) {
		googleAuthClient.setCredentials(credentials);
	}
}

export { googleAuth, setCredentials };
