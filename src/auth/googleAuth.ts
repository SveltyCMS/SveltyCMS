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
	if (googleAuthClient) return googleAuthClient;
	if (!privateEnv.GOOGLE_CLIENT_ID || !privateEnv.GOOGLE_CLIENT_SECRET) {
		logger.warn('Google client ID and secret are not provided. OAuth unavailable.');
		return null;
	}
	logger.debug('Setting up Google OAuth2...');
	const { google } = await import('googleapis');
	googleAuthClient = new google.auth.OAuth2(
		privateEnv.GOOGLE_CLIENT_ID,
		privateEnv.GOOGLE_CLIENT_SECRET,
		`${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
	);
	return googleAuthClient;
}

export { googleAuth };
