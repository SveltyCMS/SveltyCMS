import { getPrivateSettingSync } from './settingsService.js';
import { publicEnv } from './globalSettings.svelte.js';
import { logger } from './logger.js';
function getOAuthRedirectUri() {
	logger.debug('🚀 Production mode detected - using production host');
	return `${publicEnv.HOST_PROD}/login/oauth`;
}
let googleAuthClient = null;
async function googleAuth() {
	const googleClientId = getPrivateSettingSync('GOOGLE_CLIENT_ID');
	const googleClientSecret = getPrivateSettingSync('GOOGLE_CLIENT_SECRET');
	if (!googleClientId || !googleClientSecret) {
		logger.warn('Google client ID and secret are not provided. OAuth unavailable.');
		return null;
	}
	try {
		if (!googleAuthClient) {
			logger.debug('Setting up Google OAuth2...');
			const { google } = await import('googleapis');
			const redirectUri = getOAuthRedirectUri();
			logger.debug(`Using OAuth redirect URI: ${redirectUri}`);
			googleAuthClient = new google.auth.OAuth2(googleClientId, googleClientSecret, redirectUri);
		}
		return googleAuthClient;
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Unknown error initializing Google OAuth client';
		logger.error('Error initializing Google OAuth client:', error);
		return null;
	}
}
async function generateGoogleAuthUrl(token, promptType, tenantId) {
	const googleAuthClient2 = await googleAuth();
	if (!googleAuthClient2) {
		throw new Error('Google OAuth is not initialized');
	}
	const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'];
	const baseUrl = getOAuthRedirectUri();
	const authUrlOptions = {
		access_type: 'online',
		// Changed from 'offline' to 'online' to disable PKCE
		scope: scopes.join(' '),
		redirect_uri: baseUrl,
		state: token ? encodeURIComponent(token) : void 0,
		include_granted_scopes: true
		// Note: Using 'online' access_type prevents PKCE parameters from being auto-added
	};
	if (promptType) {
		authUrlOptions.prompt = promptType;
	}
	const authUrl = googleAuthClient2.generateAuthUrl(authUrlOptions);
	logger.debug('Generated Google Auth URL', { tenantId, promptType });
	return authUrl;
}
export { getOAuthRedirectUri as a, googleAuth as b, generateGoogleAuthUrl as g };
//# sourceMappingURL=googleAuth.js.map
