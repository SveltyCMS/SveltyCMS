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

// Cache invalidation
import { invalidateUserCountCache } from '@src/hooks.server';

// Utils
import { saveAvatarImage } from '@utils/media/mediaStorage';
import { getFirstCollectionRedirectUrl } from '@utils/navigation';

// Stores
import { systemLanguage, type Locale } from '@stores/store.svelte';
import { get } from 'svelte/store';

// System Logger
import { generateGoogleAuthUrl, getOAuthRedirectUri } from '@src/auth/googleAuth';
import { logger } from '@utils/logger.svelte';

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
		const userLanguage = (get(systemLanguage) as Locale) || 'en';
		const emailProps = {
			username,
			email,
			hostLink: publicEnv.HOST_PROD || `https://${request.headers.get('host')}`,
			sitename: publicEnv.SITE_NAME || 'SveltyCMS'
		};

		await fetchFn('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				recipientEmail: email,
				subject: `Welcome to ${emailProps.sitename}`,
				templateName: 'welcomeUser',
				props: emailProps,
				languageTag: userLanguage
			})
		});
		logger.debug('Welcome email sent', { email: email });
	} catch (err) {
		logger.error('Error sending welcome email:', err as Error);
	}
}

// Helper function to fetch and save Google avatar
async function fetchAndSaveGoogleAvatar(avatarUrl: string, userEmail: string): Promise<string | null> {
	try {
		logger.debug(`Fetching Google avatar from: ${avatarUrl}`);

		// Ensure database is fully initialized before saving avatar
		await dbInitPromise;

		const response = await fetch(avatarUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch avatar: ${response.statusText}`);
		}
		const blob = await response.blob();

		// Determine the correct file type from the response
		const contentType = response.headers.get('content-type') || 'image/jpeg';
		let fileName = 'google-avatar.jpg';
		let mimeType = 'image/jpeg';

		if (contentType.includes('image/png')) {
			fileName = 'google-avatar.png';
			mimeType = 'image/png';
		} else if (contentType.includes('image/webp')) {
			fileName = 'google-avatar.webp';
			mimeType = 'image/webp';
		} else if (contentType.includes('image/gif')) {
			fileName = 'google-avatar.gif';
			mimeType = 'image/gif';
		}

		const avatarFile = new File([blob], fileName, { type: mimeType });

		logger.debug(`Created avatar file: ${fileName}, size: ${avatarFile.size} bytes, type: ${mimeType}`);

		const savedUrl = await saveAvatarImage(avatarFile, userEmail);

		if (!savedUrl) {
			throw new Error('Failed to save avatar image');
		}

		logger.debug(`Avatar saved successfully at: ${savedUrl}`);
		return savedUrl;
	} catch (err) {
		logger.error('Error fetching and saving Google avatar:', {
			error: err instanceof Error ? err.message : 'Unknown error',
			stack: err instanceof Error ? err.stack : undefined,
			avatarUrl
		});
		return null;
	}
}

// Handle Google OAuth user data
async function handleGoogleUser(
	googleUser: GoogleUserInfo,
	isFirst: boolean,
	token: string | null,
	refreshToken: string | null,
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

	logger.debug('OAuth user lookup for email', { email: email });
	logger.debug(`User found: ${user ? 'YES' : 'NO'}`);
	if (user) {
		logger.debug(`Existing user ID: \x1b[34m${user._id}\x1b[0m, username: ${user.username}`);
	}

	if (!user) {
		// Handle new user creation with invite token validation
		if (!isFirst) {
			// For non-first users, validate the invite token
			if (!token) throw new Error('A valid invitation is required to create an account via OAuth');
			const tokenValidation = await auth?.validateRegistrationToken(token);
			if (!tokenValidation?.isValid || !tokenValidation?.details) throw new Error('This invitation is invalid, expired, or has already been used');
			// Check that the OAuth email matches the invited email
			if (email.toLowerCase() !== tokenValidation.details.email.toLowerCase())
				throw new Error('The Google account email does not match the invitation email');
			// Use the role from the token for invited users
			const inviteRole = tokenValidation.details.role;
			let avatarUrl: string | null = null;
			if (googleUser.picture) avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture, email);

			// Create the invited user with the role from the token
			const userData = {
				email,
				username: googleUser.name ?? '',
				firstName: googleUser.given_name,
				lastName: googleUser.family_name,
				avatar: avatarUrl,
				role: inviteRole,
				lastAuthMethod: 'google',
				isRegistered: true,
				blocked: false,
				googleRefreshToken: refreshToken
			};

			logger.debug('Creating invited user with data:', { ...userData, email: userData.email.replace(/(.{2}).*@(.*)/, '$1****@$2') });
			user = await auth?.createUser(userData, true);
			// Invalidate user count cache after user creation
			invalidateUserCountCache();

			// Consume the invite token after successful user creation
			await auth?.consumeRegistrationToken(token);
			logger.info(`Invited user ${user?.username} created successfully via OAuth and token consumed`);

			// Send welcome email for invited users
			await sendWelcomeEmail(fetchFn, email, googleUser.name || '', request);
		} else {
			// Handle first user (admin) creation - no token required
			let avatarUrl: string | null = null;
			if (googleUser.picture) avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture, email);
			// Create the first user (admin)

			const adminRole = roles.find((r) => r.isAdmin);
			if (!adminRole) throw new Error('Admin role not found in roles configuration');

			const userData = {
				email,
				username: googleUser.name ?? '',
				firstName: googleUser.given_name,
				lastName: googleUser.family_name,
				avatar: avatarUrl,
				role: adminRole._id,
				permissions: adminRole.permissions,
				lastAuthMethod: 'google',
				isRegistered: true,
				blocked: false,
				googleRefreshToken: refreshToken
			};

			logger.debug('Creating first user (admin) with data:', { ...userData, email: userData.email.replace(/(.{2}).*@(.*)/, '$1****@$2') });
			user = await auth?.createUser(userData, true);

			// Invalidate user count cache after first user (admin) creation
			invalidateUserCountCache();

			// Send welcome email for new admin
			await sendWelcomeEmail(fetchFn, email, googleUser.name || '', request);
		}
	} else {
		// Existing user - no token required for sign-in
		logger.debug(`Existing user signing in: ${user._id}, current avatar: ${user.avatar ? 'YES' : 'NO'}`);

		// Always try to update avatar from Google if available and user doesn't have one
		let avatarUrl: string | null = null;
		if (googleUser.picture && (!user.avatar || user.avatar === null || user.avatar === undefined)) {
			avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture, email);
		}

		// Always update user attributes (even if avatar is null, to ensure other fields are updated)
		const updateData = {
			email,
			lastAuthMethod: 'google',
			firstName: googleUser.given_name ?? user.firstName ?? '',
			lastName: googleUser.family_name ?? user.lastName ?? ''
		};

		if (avatarUrl) updateData.avatar = avatarUrl;

		//Store refresh token for existing user if we receive a new one.
		if (refreshToken) {
			updateData.googleRefreshToken = refreshToken;
		}

		logger.debug('Updating user attributes:', updateData);
		await auth.updateUserAttributes(user._id.toString(), updateData);
		logger.debug(`Updated user attributes for: \x1b[34m${user._id}\x1b[0m`);
	}

	if (!user?._id) throw new Error('User ID is missing after creation or retrieval');
	// Create User Session and set cookie
	const session = await auth?.createSession({ user_id: user._id });
	const sessionCookie = auth?.createSessionCookie(session._id);
	cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
}

export const load: PageServerLoad = async ({ url, cookies, fetch, request }) => {
	try {
		await dbInitPromise;
		logger.debug('System ready in OAuth load function');
		if (!auth) throw error(500, 'Internal Server Error: Authentication system is not initialized');

		logger.debug('OAuth Callback called:');
		const firstUserExists = (await auth.getUserCount()) !== 0;
		logger.debug(`First user exists: \x1b[34m${firstUserExists}\x1b[0m`);

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
				const authUrl = await generateGoogleAuthUrl(token, 'consent');
				redirect(302, authUrl);
			} else {
				throw error(400, { message: 'OAuth Authentication Failed', details: `${error_param}: ${error_subtype || 'Unknown error'}` });
			}
		}

		// If no code is present, handle initial OAuth flow
		if (!code) {
			// For first user (no existing users), redirect directly to OAuth
			if (!firstUserExists) {
				const authUrl = await generateGoogleAuthUrl(token, 'consent');
				redirect(302, authUrl);
			}

			// For non-first users without a token, show token input form
			if (firstUserExists && !token) {
				return { isFirstUser: !firstUserExists, requiresToken: true };
			}

			// For non-first users with a token, redirect to OAuth with the token
			if (firstUserExists && token) {
				const authUrl = await generateGoogleAuthUrl(token, 'consent');
				redirect(302, authUrl);
			}
		}

		// Process OAuth callback
		try {
			logger.debug(`Processing OAuth callback with code: ${code.substring(0, 20)}...`);

			// Import and get the private config directly
			const { privateEnv } = await import('@root/config/private');

			// Create a fresh OAuth client instance specifically for token exchange
			// Use the same environment detection logic as the OAuth URL generation
			const redirectUri = getOAuthRedirectUri();
			const googleAuthClient = new google.auth.OAuth2(privateEnv.GOOGLE_CLIENT_ID, privateEnv.GOOGLE_CLIENT_SECRET, redirectUri);
			const { tokens } = await googleAuthClient.getToken(code);
			if (!tokens || !tokens.access_token) throw error(500, 'Failed to authenticate with Google');

			logger.debug('Successfully obtained tokens from Google');
			googleAuthClient.setCredentials(tokens);
			// Fetch Google user profile
			const oauth2 = google.oauth2({ auth: googleAuthClient, version: 'v2' });
			const { data: googleUser } = await oauth2.userinfo.get();
			if (!googleUser) throw error(500, 'Could not retrieve user information');

			// Pass the refresh token from the `tokens` object to the handler function.
			await handleGoogleUser(googleUser as GoogleUserInfo, !firstUserExists, token, tokens.refresh_token || null, cookies, fetch, request);

			logger.info('Successfully processed OAuth callback and created session');
			// Redirect to first collection using centralized utility
			const redirectUrl = await getFirstCollectionRedirectUrl();
			logger.debug(`Redirecting to: \x1b[34m${redirectUrl}\x1b[0m`);
			throw redirect(302, redirectUrl);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && (err.status === 302 || err.status === 303)) {
				throw err;
			}
			const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth callback';
			logger.error('OAuth callback processing error:', { error: err, stack: err instanceof Error ? err.stack : undefined, code, token });
			// Provide more specific error messages based on the error type
			if (errorMessage.includes('A valid invitation is required')) {
				throw error(403, {
					message: 'Admin Invitation Required',
					details: 'This CMS requires an invitation from an administrator to create any new account.'
				});
			}
			if (errorMessage.includes('invitation is invalid, expired, or has already been used')) {
				throw error(403, {
					message: 'Invalid or Expired Invitation',
					details: 'Your invitation token is invalid, expired, or has already been used.'
				});
			}
			if (errorMessage.includes('Google account email does not match the invitation email')) {
				throw error(403, {
					message: 'Google Account Email Mismatch',
					details: 'The Google account email does not match the invitation email address.'
				});
			}
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

		// Check if this is already a properly formatted error from inner catch blocks
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
			logger.debug('Re-throwing formatted error from inner handler');
			throw err;
		}
		const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth process';
		logger.error('Comprehensive OAuth Error:', { message: errorMessage, stack: err instanceof Error ? err.stack : 'No stack trace', fullError: err });
		// Provide more detailed error information for the user
		throw error(500, {
			message: 'OAuth Authentication Failed',
			details: errorMessage,
			type: err instanceof Error ? err.constructor.name : 'Unknown Error Type'
		});
	}

	throw error(500, { message: 'OAuth Authentication Failed', details: 'Unexpected end of OAuth flow' });
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
