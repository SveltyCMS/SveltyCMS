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
import type { OAuth2Client } from 'google-auth-library';
import type { Credentials } from 'google-auth-library';

// System Logger
import { logger } from '@utils/logger.svelte';

// Utility function to determine the correct OAuth redirect URI
function getOAuthRedirectUri(): string {
	// Check if we're in development mode
	if (dev) {
		return `${publicEnv.HOST_DEV}/login/oauth`;
	}

	// For production builds, we need to detect if we're running locally (preview mode)
	if (typeof process !== 'undefined') {
		// Comprehensive environment detection
		const allEnvVars = {
			PORT: process.env.PORT,
			NODE_ENV: process.env.NODE_ENV,
			VITE_PREVIEW: process.env.VITE_PREVIEW,
			PREVIEW: process.env.PREVIEW,
			SERVER_PORT: privateEnv.SERVER_PORT,
			dev_flag: dev,
			argv_full: process.argv.join(' '),
			cwd: process.cwd?.(),
			title: process.title
		};

		logger.debug(`Full environment detection:`, allEnvVars);

		// Method 1: Explicit preview environment variables
		if (process.env.VITE_PREVIEW === 'true' || process.env.PREVIEW === 'true') {
			logger.debug('✅ Detected preview mode via VITE_PREVIEW/PREVIEW env var - using localhost:4173');
			return `http://localhost:4173/login/oauth`;
		}

		// Method 2: Check if running on port 4173 (default preview port)
		const port = process.env.PORT || privateEnv.SERVER_PORT;
		if (port === '4173' || port === 4173) {
			logger.debug('✅ Detected preview mode via PORT 4173 - using localhost:4173');
			return `http://localhost:4173/login/oauth`;
		}

		// Method 3: Check command line arguments for preview indicators
		const argvString = process.argv.join(' ');
		if (argvString.includes('preview') || argvString.includes('4173')) {
			logger.debug('✅ Detected preview mode via command line args - using localhost:4173');
			return `http://localhost:4173/login/oauth`;
		}

		// Method 4: If not in production and not dev, assume preview
		const nodeEnv = process.env.NODE_ENV;
		if (!nodeEnv || nodeEnv !== 'production') {
			logger.debug('✅ Detected preview mode (not production env) - using localhost:4173');
			return `http://localhost:4173/login/oauth`;
		}
	}

	logger.debug('🚀 Using production host for OAuth redirect');
	// Default to production host
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
			logger.debug(`Using OAuth redirect URI: ${redirectUri}`);

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

async function generateGoogleAuthUrl(token?: string | null, promptType?: 'consent' | 'none' | 'select_account'): Promise<string> {
	const googleAuthClient = await googleAuth();
	if (!googleAuthClient) {
		throw new Error('Google OAuth is not initialized');
	}

	const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];
	const baseUrl = getOAuthRedirectUri();

	logger.debug(`Generating OAuth URL with base URL: ${baseUrl} and prompt: ${promptType || 'default'}`);

	// Generate auth URL without PKCE parameters to avoid Google's "code_verifier or verifier is not needed" error
	// Use 'online' access_type to prevent PKCE from being auto-enabled in newer googleapis versions
	const authUrlOptions: Record<string, string | boolean | undefined> = {
		access_type: 'online', // Changed from 'offline' to 'online' to disable PKCE
		scope: scopes.join(' '),
		redirect_uri: baseUrl,
		state: token ? encodeURIComponent(token) : undefined,
		include_granted_scopes: true
		// Note: Using 'online' access_type prevents PKCE parameters from being auto-added
	};

	// Only add prompt if explicitly specified
	if (promptType) {
		authUrlOptions.prompt = promptType;
	}

	const authUrl = googleAuthClient.generateAuthUrl(authUrlOptions);

	logger.debug(`Generated OAuth URL: ${authUrl}`);
	return authUrl;
}

export { googleAuth, setCredentials, generateGoogleAuthUrl, getOAuthRedirectUri };
