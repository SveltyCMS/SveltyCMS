/**
 * @file src/auth/googleAuth.ts
 * @description Utility functions for Google OAuth.
 *
 * This module provides:
 * - Google OAuth client initialization
 * - Google OAuth client setup
 */

import { dev } from '$app/environment';
import { config, getGoogleClientId, getGoogleClientSecret } from '@src/lib/config.server';
import type { Credentials, OAuth2Client } from 'google-auth-library';

// System Logger
import { logger } from '@utils/logger.svelte';

// Utility function to determine the correct OAuth redirect URI
async function getOAuthRedirectUri(): Promise<string> {
	// Initialize configuration service
	await config.initialize();

	// Use SvelteKit's built-in environment detection
	if (dev) {
		logger.debug('🔧 Development mode detected - using development host');
		const hostDev = await config.getPublic('HOST_DEV');
		return `${hostDev}/login/oauth`;
	} // For production builds, use the production host

	logger.debug('🚀 Production mode detected - using production host');
	const hostProd = await config.getPublic('HOST_PROD');
	return `${hostProd}/login/oauth`;
}

// Google OAuth
let googleAuthClient: OAuth2Client | null = null;

// Initialize Google OAuth client with ID, secret, and redirect URL
async function googleAuth(): Promise<OAuth2Client | null> {
	// Initialize configuration service
	await config.initialize();

	const clientId = await getGoogleClientId();
	const clientSecret = await getGoogleClientSecret();

	if (!clientId || !clientSecret) {
		logger.warn('Google client ID and secret are not provided. OAuth unavailable.');
		return null;
	}

	try {
		if (!googleAuthClient) {
			logger.debug('Setting up Google OAuth2...');
			const { google } = await import('googleapis');
			const redirectUri = getOAuthRedirectUri();

			googleAuthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
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
	const baseUrl = await getOAuthRedirectUri(); // Generate auth URL without PKCE parameters to avoid Google's "code_verifier or verifier is not needed" error
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
