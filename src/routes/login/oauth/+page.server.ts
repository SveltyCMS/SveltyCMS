/**
 * @file src/routes/login/oauth/+page.server.ts
 * @description Server-side logic for the OAuth page.
 */

import { publicEnv } from '@root/config/public';
import { error, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Auth
import { google } from 'googleapis';

//Db
import { auth, dbInitPromise } from '@src/databases/db';

// Utils
import { saveAvatarImage } from '@utils/media/mediaStorage';
import { getFirstCollectionRedirectUrl } from '@utils/navigation';

// Stores
import { systemLanguage } from '@stores/store.svelte';

// System Logger
import { logger } from '@utils/logger.svelte';
import { generateGoogleAuthUrl } from '@src/auth/googleAuth';

// Import roles
import { roles } from '@root/config/roles';

// Types
interface GoogleUserInfo {
	email?: string | null;
	name?: string | null;
	given_name?: string | null;
	family_name?: string | null;
	picture?: string | null;
	locale?: string | null;
}

// Send welcome email
async function sendWelcomeEmail(
	fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
	email: string,
	username: string,
	request: Request
) {
	try {
		await fetchFn('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: `Welcome to ${publicEnv.SITE_NAME}, ${username}!`,
				message: `Welcome ${username} to ${publicEnv.SITE_NAME}`,
				templateName: 'welcomeUser',
				props: {
					username,
					email,
					hostLink: publicEnv.HOST_PROD || `https://${request.headers.get('host')}`
				}
			})
		});
		logger.debug(`Welcome email sent to ${email}`);
	} catch (err) {
		logger.error('Error sending welcome email:', err as Error);
	}
}

// Helper function to fetch and save Google avatar
async function fetchAndSaveGoogleAvatar(avatarUrl: string): Promise<string | null> {
	try {
		const response = await fetch(avatarUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch avatar: ${response.statusText}`);
		}
		const blob = await response.blob();
		const avatarFile = new File([blob], 'google-avatar.jpg', { type: 'image/jpeg' });
		const savedUrl = await saveAvatarImage(avatarFile);

		if (!savedUrl) {
			throw new Error('Failed to save avatar image');
		}

		return savedUrl;
	} catch (err) {
		logger.error('Error fetching and saving Google avatar:', err as Error);
		return null;
	}
}

// Handle Google OAuth user data
async function handleGoogleUser(
	googleUser: GoogleUserInfo,
	isFirst: boolean,
	token: string | null,
	cookies: Cookies,
	fetchFn: typeof fetch,
	request: Request
): Promise<void> {
	const email = googleUser.email;
	if (!email) {
		throw new Error('Google did not return an email address');
	}

	if (googleUser.locale) {
		systemLanguage.set(googleUser.locale);
	}

	if (!auth) {
		logger.error('Auth adatper not initialized cannot login using oauth');
	}

	// Check if user exists
	let user = await auth?.checkUser({ email });

	if (!user) {
		// Only require token for new users (not first user)
		if (!isFirst) {
			if (!token) {
				throw new Error('Registration token is required for new users');
			}
			const tokenValidation = await auth?.validateToken(token);
			if (!tokenValidation?.isValid) {
				throw new Error('Invalid or expired registration token');
			}
		}

		// Handle new user creation
		let avatarUrl: string | null = null;
		if (googleUser.picture) {
			avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture);
		}

		// Create the new user
		user = await auth?.createUser(
			{
				email,
				username: googleUser.name ?? '',
				firstName: googleUser.given_name,
				lastName: googleUser.family_name,
				avatar: avatarUrl,
				role: isFirst ? roles.find(r => r.isAdmin)?._id || 'admin' : roles.find(r => r._id === 'user')?._id || 'user',
				lastAuthMethod: 'google',
				isRegistered: true,
				blocked: false
			},
			true
		);

		// Send welcome email for new users
		await sendWelcomeEmail(fetchFn, email, googleUser.name || '', request);
	} else {
		// Existing user - no token required for sign-in
		// Update existing user's avatar if they have a Google avatar
		let avatarUrl: string | null = null;
		if (googleUser.picture) {
			avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture);
		}

		// Update user attributes
		await auth.updateUserAttributes(user._id.toString(), {
			email,
			lastAuthMethod: 'google',
			firstName: googleUser.given_name ?? '',
			lastName: googleUser.family_name ?? '',
			avatar: user.avatar ? user.avatar : avatarUrl ? avatarUrl : undefined
		});
	}

	if (!user?._id) {
		throw new Error('User ID is missing after creation or retrieval');
	}

	// Create User Session and set cookie
	const session = await auth?.createSession({ user_id: user._id });
	const sessionCookie = auth?.createSessionCookie(session._id);
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
}

export const load: PageServerLoad = async ({ url, cookies, fetch, request }) => {
	try {
		await dbInitPromise; // Wait for system initialization including ContentManager
		logger.debug('System ready in OAuth load function');

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Authentication system is not initialized');
		}

		// Extensive logging for OAuth redirect
		logger.debug('OAuth Callback Details:');
		logger.debug(`Full URL: ${url.toString()}`);
		logger.debug(`Host: ${url.host}`);
		logger.debug(`Pathname: ${url.pathname}`);
		logger.debug(`Search Params: ${url.searchParams.toString()}`);

		// Check if this is the first user
		let firstUserExists = false;
		try {
			firstUserExists = (await auth.getUserCount()) !== 0;
			logger.debug(`First user exists: ${firstUserExists}`);
		} catch (err) {
			logger.error('Error fetching user count:', err);
			throw error(500, 'Error checking first user status');
		}

		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const error_param = url.searchParams.get('error');
		const error_subtype = url.searchParams.get('error_subtype');
		const token = state ? decodeURIComponent(state) : null;

		logger.debug(`Authorization code from URL: \x1b[34m${code}\x1b[0m`);
		logger.debug(`Registration token from state: \x1b[34m${token}\x1b[0m`);
		logger.debug(`Is First User: \x1b[34m${!firstUserExists}\x1b[0m`);

		// Handle OAuth errors first
		if (error_param) {
			logger.error(`OAuth Error: ${error_param}`, { error_subtype, url: url.toString() });

			if (error_param === 'interaction_required' || error_param === 'access_denied') {
				// User needs to go through consent flow or cancelled
				logger.debug('OAuth interaction required - redirecting to consent flow');
				try {
					const authUrl = await generateGoogleAuthUrl(token, 'consent');
					redirect(302, authUrl);
				} catch (err) {
					logger.error('Error generating OAuth URL after interaction_required:', err);
					throw error(500, 'Failed to initialize OAuth');
				}
			} else {
				// Other OAuth errors
				throw error(400, {
					message: 'OAuth Authentication Failed',
					details: `${error_param}: ${error_subtype || 'Unknown error'}`
				});
			}
		}

		// If no code is present, handle initial OAuth flow
		if (!code && !firstUserExists) {
			logger.debug('No first user and no code - redirecting to OAuth');
			try {
				const authUrl = await generateGoogleAuthUrl(token, 'consent');
				redirect(302, authUrl);
			} catch (err) {
				logger.error('Error generating OAuth URL:', err);
				throw error(500, 'Failed to initialize OAuth');
			}
		}

		// For non-first users without a token, show token input form
		if (firstUserExists && !token && !code) {
			logger.debug('First user exists, no token, no code - showing token input form');
			return {
				isFirstUser: !firstUserExists,
				requiresToken: true
			};
		}

		if (!code) {
			logger.debug('No authorization code found, showing token input form');
			return {
				isFirstUser: !firstUserExists,
				requiresToken: firstUserExists
			};
		}

		// Process OAuth callback
		try {
			// Debug: Let's explicitly check what we're working with
			logger.debug(`Processing OAuth callback with code: ${code.substring(0, 20)}...`);

			// Import and get the private config directly
			const { privateEnv } = await import('@root/config/private');
			const { dev } = await import('$app/environment');

			// Create a fresh OAuth client instance specifically for token exchange
			const redirectUri = `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`;
			logger.debug(`Creating OAuth client with redirect URI: ${redirectUri}`);
			logger.debug(`Client ID: ${privateEnv.GOOGLE_CLIENT_ID?.substring(0, 20)}...`);

			const googleAuthClient = new google.auth.OAuth2(
				privateEnv.GOOGLE_CLIENT_ID,
				privateEnv.GOOGLE_CLIENT_SECRET,
				redirectUri
			);

			// Try using the getToken method with explicit options to disable PKCE
			logger.debug('Attempting to exchange authorization code for tokens...');

			// Workaround for googleapis v150 bug: manually make the token request to avoid automatic PKCE injection
			// Reference: https://github.com/googleapis/google-api-nodejs-client/issues/3681
			const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					client_id: privateEnv.GOOGLE_CLIENT_ID!,
					client_secret: privateEnv.GOOGLE_CLIENT_SECRET!,
					code: code,
					grant_type: 'authorization_code',
					redirect_uri: redirectUri
					// Explicitly NOT including code_verifier to avoid the googleapis bug
				}).toString()
			});

			if (!tokenResponse.ok) {
				const errorData = await tokenResponse.json();
				logger.error('Token exchange failed:', errorData);
				throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
			}

			const tokens = await tokenResponse.json();

			if (!tokens || !tokens.access_token) {
				logger.error('Failed to obtain tokens from Google');
				throw error(500, 'Failed to authenticate with Google');
			}

			logger.debug('Successfully obtained tokens from Google');

			// Set credentials on the OAuth client using the manually obtained tokens
			googleAuthClient.setCredentials({
				access_token: tokens.access_token,
				token_type: tokens.token_type,
				expires_in: tokens.expires_in,
				refresh_token: tokens.refresh_token,
				scope: tokens.scope
			});

			// Fetch Google user profile
			const oauth2 = google.oauth2({ auth: googleAuthClient, version: 'v2' });
			const { data: googleUser } = await oauth2.userinfo.get();

			if (!googleUser) {
				logger.error('Failed to fetch Google user profile');
				throw error(500, 'Could not retrieve user information');
			}

			// Handle user creation/update and session creation
			await handleGoogleUser(googleUser as GoogleUserInfo, !firstUserExists, token, cookies, fetch, request);
			logger.info('Successfully processed OAuth callback and created session');

			// Redirect to first collection using centralized utility
			const redirectUrl = await getFirstCollectionRedirectUrl();
			logger.debug(`Redirecting to: ${redirectUrl}`);
			throw redirect(302, redirectUrl);
		} catch (err) {
			// Check if this is a redirect (which is expected and successful)
			if (err && typeof err === 'object' && 'status' in err && (err.status === 302 || err.status === 303)) {
				logger.info('OAuth processing completed successfully, redirecting user');
				throw err; // Re-throw the redirect
			}

			const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth callback';
			logger.error('OAuth callback processing error:', {
				error: err,
				stack: err instanceof Error ? err.stack : undefined,
				code,
				token
			});

			// Provide more detailed error information
			const errorDetails = err instanceof Error ? err.stack : 'No stack trace available';
			throw error(500, {
				message: 'OAuth Processing Failed',
				details: errorMessage,
				stack: errorDetails,
				code: code ? 'Present' : 'Missing',
				token: token ? 'Present' : 'Missing'
			});
		}
	} catch (err) {
		// Check if this is a redirect (which is expected and successful)
		if (err && typeof err === 'object' && 'status' in err && (err.status === 302 || err.status === 303)) {
			logger.info('OAuth flow completed successfully, performing redirect');
			throw err; // Re-throw the redirect
		}

		const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth process';
		logger.error('Comprehensive OAuth Error:', {
			message: errorMessage,
			stack: err instanceof Error ? err.stack : 'No stack trace',
			fullError: err
		});

		// Provide more detailed error information for the user
		throw error(500, {
			message: 'OAuth Authentication Failed',
			details: errorMessage,
			type: err instanceof Error ? err.constructor.name : 'Unknown Error Type'
		});
	}

	// If we reach this point, something went wrong - return error data
	throw error(500, {
		message: 'OAuth Authentication Failed',
		details: 'Unexpected end of OAuth flow'
	});
};

export const actions: Actions = {
	OAuth: async ({ request }) => {
		const data = await request.formData();
		const token = data.get('token');

		try {
			// Generate OAuth URL with token in state parameter
			const authUrl = await generateGoogleAuthUrl(token?.toString() || null);
			throw redirect(302, authUrl);
		} catch (err) {
			if (err instanceof Error) {
				const errorMessage = err.message || 'Failed to initialize OAuth';
				logger.error('Error during OAuth initialization:', errorMessage);
				throw error(500, { message: errorMessage });
			}
			throw err;
		}
	}
};
