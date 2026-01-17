import { error, redirect } from '@sveltejs/kit';
import { google } from 'googleapis';
import { b as dbInitPromise, a as auth } from '../../../../chunks/db.js';
import { invalidateUserCountCache } from '../../../../chunks/handleAuthorization.js';
import { contentManager } from '../../../../chunks/ContentManager.js';
import { s as saveAvatarImage } from '../../../../chunks/mediaStorage.server.js';
import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { publicEnv } from '../../../../chunks/globalSettings.svelte.js';
import { a as app } from '../../../../chunks/store.svelte.js';
import { g as generateGoogleAuthUrl, a as getOAuthRedirectUri } from '../../../../chunks/googleAuth.js';
import { l as logger } from '../../../../chunks/logger.server.js';
async function sendWelcomeEmail(fetchFn, email, username, request) {
	try {
		const userLanguage = app.systemLanguage || 'en';
		const hostProd = publicEnv.HOST_PROD;
		const siteName = publicEnv.SITE_NAME;
		const emailProps = {
			username,
			email,
			hostLink: hostProd || `https://${request.headers.get('host')}`,
			sitename: siteName || 'SveltyCMS'
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
		logger.debug('Welcome email sent', { email });
	} catch (err) {
		logger.error('Error sending welcome email:', err);
	}
}
async function fetchAndSaveGoogleAvatar(avatarUrl, userEmail) {
	try {
		logger.debug(`Fetching Google avatar from: ${avatarUrl}`);
		await dbInitPromise;
		const response = await fetch(avatarUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch avatar: ${response.statusText}`);
		}
		const blob = await response.blob();
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
			stack: err instanceof Error ? err.stack : void 0,
			avatarUrl
		});
		return null;
	}
}
async function handleGoogleUser(googleUser, isFirst, token, refreshToken, cookies, fetchFn, request) {
	const email = googleUser.email;
	if (!email) {
		throw new Error('Google did not return an email address');
	}
	if (googleUser.locale) {
		const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en'];
		const locale = googleUser.locale;
		if (supportedLocales.includes(locale)) {
			app.systemLanguage = locale;
		}
	}
	if (!auth) {
		logger.error('Auth adatper not initialized cannot login using oauth');
	}
	let user = await auth?.checkUser({ email });
	logger.debug('OAuth user lookup for email', { email });
	logger.debug(`User found: ${user ? 'YES' : 'NO'}`);
	if (user) {
		logger.debug(`Existing user ID: ${user._id}, username: ${user.username}`);
	}
	if (!user) {
		if (!isFirst) {
			if (!token) throw new Error('A valid invitation is required to create an account via OAuth');
			const tokenValidation = await auth?.validateRegistrationToken(token);
			if (!tokenValidation?.isValid || !tokenValidation?.details) throw new Error('This invitation is invalid, expired, or has already been used');
			if (email.toLowerCase() !== tokenValidation.details.email.toLowerCase())
				throw new Error('The Google account email does not match the invitation email');
			const inviteRole = tokenValidation.details.role;
			let avatarUrl = null;
			if (googleUser.picture) avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture, email);
			const userData = {
				email,
				username: googleUser.name ?? '',
				firstName: googleUser.given_name ?? void 0,
				lastName: googleUser.family_name ?? void 0,
				avatar: avatarUrl ?? void 0,
				role: inviteRole,
				lastAuthMethod: 'google',
				isRegistered: true,
				blocked: false,
				googleRefreshToken: refreshToken ?? void 0
			};
			logger.debug('Creating invited user with data:', { ...userData, email: userData.email.replace(/(.{2}).*@(.*)/, '$1****@$2') });
			user = await auth?.createUser(userData, true);
			invalidateUserCountCache();
			await auth?.consumeRegistrationToken(token);
			logger.info(`Invited user ${user?.username} created successfully via OAuth and token consumed`);
			await sendWelcomeEmail(fetchFn, email, googleUser.name || '', request);
		} else {
			let avatarUrl = null;
			if (googleUser.picture) avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture, email);
			const roles = await auth?.getAllRoles();
			const adminRole = roles?.find((r) => r.isAdmin);
			if (!adminRole) throw new Error('Admin role not found in roles configuration');
			const userData = {
				email,
				username: googleUser.name ?? '',
				firstName: googleUser.given_name ?? void 0,
				lastName: googleUser.family_name ?? void 0,
				avatar: avatarUrl ?? void 0,
				role: adminRole._id,
				lastAuthMethod: 'google',
				isRegistered: true,
				blocked: false,
				googleRefreshToken: refreshToken ?? void 0
			};
			logger.debug('Creating first user (admin) with data:', { ...userData, email: userData.email.replace(/(.{2}).*@(.*)/, '$1****@$2') });
			user = await auth?.createUser(userData, true);
			invalidateUserCountCache();
			await sendWelcomeEmail(fetchFn, email, googleUser.name || '', request);
		}
	} else {
		logger.debug(`Existing user signing in: ${user._id}, current avatar: ${user.avatar ? 'YES' : 'NO'}`);
		let avatarUrl = null;
		if (googleUser.picture && (!user.avatar || user.avatar === null || user.avatar === void 0)) {
			avatarUrl = await fetchAndSaveGoogleAvatar(googleUser.picture, email);
		}
		const updateData = {
			email,
			lastAuthMethod: 'google',
			firstName: googleUser.given_name ?? user.firstName ?? '',
			lastName: googleUser.family_name ?? user.lastName ?? ''
		};
		if (avatarUrl) updateData.avatar = avatarUrl;
		if (refreshToken) {
			updateData.googleRefreshToken = refreshToken;
		}
		logger.debug('Updating user attributes:', updateData);
		if (!auth) throw new Error('Auth system not initialized');
		await auth.updateUserAttributes(user._id.toString(), updateData);
		logger.debug(`Updated user attributes for: ${user._id}`);
	}
	if (!user?._id) throw new Error('User ID is missing after creation or retrieval');
	if (!auth) throw new Error('Auth system not initialized');
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
	const session = await auth.createSession({ user_id: user._id, expires: expiresAt.toISOString() });
	const sessionCookie = auth.createSessionCookie(session._id);
	const cookieAttributes = sessionCookie.attributes;
	cookies.set(sessionCookie.name, sessionCookie.value, { ...cookieAttributes, path: '/' });
}
const load = async ({ url, cookies, fetch: fetch2, request }) => {
	try {
		await dbInitPromise;
		logger.debug('System ready in OAuth load function');
		if (!auth) throw error(500, 'Internal Server Error: Authentication system is not initialized');
		logger.debug('OAuth Callback called:');
		const firstUserExists = (await auth.getUserCount()) !== 0;
		logger.debug(`First user exists: ${firstUserExists}`);
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const error_param = url.searchParams.get('error');
		const error_subtype = url.searchParams.get('error_subtype');
		const token = state ? decodeURIComponent(state) : null;
		logger.debug(`Authorization code from URL: ${code}`);
		logger.debug(`Registration token from state: ${token}`);
		logger.debug(`Is First User: ${!firstUserExists}`);
		if (error_param) {
			logger.error(`OAuth Error: ${error_param}`, { error_subtype, url: url.toString() });
			if (error_param === 'interaction_required' || error_param === 'access_denied') {
				const authUrl = await generateGoogleAuthUrl(token, 'consent');
				redirect(302, authUrl);
			} else {
				throw error(400, `OAuth Authentication Failed: ${error_param}: ${error_subtype || 'Unknown error'}`);
			}
		}
		if (!code) {
			if (!firstUserExists) {
				const authUrl = await generateGoogleAuthUrl(token, 'consent');
				redirect(302, authUrl);
			}
			if (firstUserExists && !token) {
				return { isFirstUser: !firstUserExists, requiresToken: true };
			}
			if (firstUserExists && token) {
				const authUrl = await generateGoogleAuthUrl(token, 'consent');
				redirect(302, authUrl);
			}
		}
		try {
			if (!code) throw error(400, 'Authorization code missing');
			logger.debug(`Processing OAuth callback with code: ${code.substring(0, 20)}...`);
			const redirectUri = getOAuthRedirectUri();
			const googleAuthClient = new google.auth.OAuth2(
				getPrivateSettingSync('GOOGLE_CLIENT_ID'),
				getPrivateSettingSync('GOOGLE_CLIENT_SECRET'),
				redirectUri
			);
			const { tokens } = await googleAuthClient.getToken(code);
			if (!tokens || !tokens.access_token) throw error(500, 'Failed to authenticate with Google');
			logger.debug('Successfully obtained tokens from Google');
			googleAuthClient.setCredentials(tokens);
			const oauth2 = google.oauth2({ auth: googleAuthClient, version: 'v2' });
			const { data: googleUser } = await oauth2.userinfo.get();
			if (!googleUser) throw error(500, 'Could not retrieve user information');
			await handleGoogleUser(googleUser, !firstUserExists, token, tokens.refresh_token || null, cookies, fetch2, request);
			logger.info('Successfully processed OAuth callback and created session');
			const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
			const userLanguage = url.searchParams.get('lang') || defaultLanguage;
			const redirectUrl = await contentManager.getFirstCollectionRedirectUrl(userLanguage);
			logger.debug(`Redirecting to: ${redirectUrl || '/'}`);
			throw redirect(302, redirectUrl || '/');
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && (err.status === 302 || err.status === 303)) {
				throw err;
			}
			const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth callback';
			logger.error('OAuth callback processing error:', { error: err, stack: err instanceof Error ? err.stack : void 0, code, token });
			if (errorMessage.includes('A valid invitation is required')) {
				throw error(403, 'Admin Invitation Required: This CMS requires an invitation from an administrator to create any new account.');
			}
			if (errorMessage.includes('invitation is invalid, expired, or has already been used')) {
				throw error(403, 'Invalid or Expired Invitation: Your invitation token is invalid, expired, or has already been used.');
			}
			if (errorMessage.includes('Google account email does not match the invitation email')) {
				throw error(403, 'Google Account Email Mismatch: The Google account email does not match the invitation email address.');
			}
			throw error(500, `OAuth Processing Failed: ${errorMessage}`);
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && (err.status === 302 || err.status === 303)) {
			logger.info('OAuth flow completed successfully, performing redirect');
			throw err;
		}
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
			logger.debug('Re-throwing formatted error from inner handler');
			throw err;
		}
		const errorMessage = err instanceof Error ? err.message : 'Unknown error during OAuth process';
		logger.error('Comprehensive OAuth Error:', { message: errorMessage, stack: err instanceof Error ? err.stack : 'No stack trace', fullError: err });
		throw error(500, `OAuth Authentication Failed: ${errorMessage}`);
	}
	throw error(500, 'OAuth Authentication Failed: Unexpected end of OAuth flow');
};
const actions = {
	OAuth: async ({ request }) => {
		const data = await request.formData();
		const token = data.get('token');
		try {
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
export { actions, load };
//# sourceMappingURL=_page.server.ts.js.map
