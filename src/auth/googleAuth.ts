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
import { OAuth2Client } from 'google-auth-library';
import type { Credentials } from 'google-auth-library';

// System Logger
import { logger } from '@utils/logger.svelte';

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
function setCredentials(credentials: Credentials): void {
    if (googleAuthClient) {
        googleAuthClient.setCredentials(credentials);
    } else {
        logger.warn('Google OAuth client is not initialized. Cannot set credentials.');
    }
}

export { googleAuth, setCredentials };
