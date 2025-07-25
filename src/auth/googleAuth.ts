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
import type { Credentials, OAuth2Client } from 'google-auth-library';

// System Logger
import { logger } from '@utils/logger.svelte';

// Utility function to determine the correct OAuth redirect URI
function getOAuthRedirectUri(): string {
	// Use SvelteKit's built-in environment detection
	if (dev) {
		logger.debug('🔧 Development mode detected - using development host');
		return `${publicEnv.HOST_DEV}/login/oauth`;
	} // For production builds, use the production host

	logger.debug('🚀 Production mode detected - using production host');
	return `${publicEnv.HOST_PROD}/login/oauth`;
}

// Google OAuth
let googleAuthClient: OAuth2Client | null = null;

// Initialize Google OAuth client with ID, secret, and redirect URL
async function googleAuth(): Promise<OAuth2Client | null> {
	if (!privateEnv.GOOGLE_CLIENT_ID || !privateEnv.GOOGLE_CLIENT_SECRET) {
		logger.warn('Google client ID and secret are not provided. OAuth unavailable.');
		return null;
	}

	try {
		if (!googleAuthClient) {
			logger.debug('Setting up Google OAuth2...');
			const { google } = await import('googleapis');
			const redirectUri = getOAuthRedirectUri();
			logger.debug(`Using OAuth redirect URI: \x1b[34m${redirectUri}\x1b[0m`);

			googleAuthClient = new google.auth.OAuth2(privateEnv.GOOGLE_CLIENT_ID, privateEnv.GOOGLE_CLIENT_SECRET, redirectUri);
		}

		return googleAuthClient;
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Unknown error initializing Google OAuth client';
		logger.error('Error initializing Google OAuth client:', error);
		return null;
	}
}

// Set credentials for the OAuth client
async function setCredentials(credentials: Credentials): Promise<void> {
	const client = await googleAuth();
	if (client) {
		client.setCredentials(credentials);
	}
}

async function generateGoogleAuthUrl(token?: string | null, promptType?: 'consent' | 'none' | 'select_account', tenantId?: string): Promise<string> {
	const googleAuthClient = await googleAuth();
	if (!googleAuthClient) {
		throw new Error('Google OAuth is not initialized');
	}

	const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];
	const baseUrl = getOAuthRedirectUri(); // Generate auth URL without PKCE parameters to avoid Google's "code_verifier or verifier is not needed" error
	// Use 'online' access_type to prevent PKCE from being auto-enabled in newer googleapis versions

	const authUrlOptions: Record<string, string | boolean | undefined> = {
		access_type: 'online', // Changed from 'offline' to 'online' to disable PKCE
		scope: scopes.join(' '),
		redirect_uri: baseUrl,
		state: token ? encodeURIComponent(token) : undefined,
		include_granted_scopes: true // Note: Using 'online' access_type prevents PKCE parameters from being auto-added
	}; // Only add prompt if explicitly specified

	if (promptType) {
		authUrlOptions.prompt = promptType;
	}

	const authUrl = googleAuthClient.generateAuthUrl(authUrlOptions);
	logger.debug('Generated Google Auth URL', { tenantId, promptType });

	return authUrl;
}

export { generateGoogleAuthUrl, getOAuthRedirectUri, googleAuth, setCredentials };
