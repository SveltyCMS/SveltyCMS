import { dev } from '../../../chunks/index3.js';
import { redirect, fail } from '@sveltejs/kit';
import { R as RateLimiter } from '../../../chunks/rateLimiter.js';
import '@isaacs/ttlcache';
import { invalidateUserCountCache } from '../../../chunks/handleAuthorization.js';
import { r as resetFormSchema, f as forgotFormSchema, l as loginFormSchema, s as signUpFormSchema } from '../../../chunks/formSchemas.js';
import { safeParse, flatten } from 'valibot';
import { b as googleAuth, g as generateGoogleAuthUrl } from '../../../chunks/googleAuth.js';
import { b as dbInitPromise, a as auth } from '../../../chunks/db.js';
import { google } from 'googleapis';
import { getPrivateSettingSync } from '../../../chunks/settingsService.js';
import { publicEnv } from '../../../chunks/globalSettings.svelte.js';
import { b as SvelteMap, a as app } from '../../../chunks/store.svelte.js';
import { logger as logger$1 } from '../../../chunks/logger.js';
import { contentManager } from '../../../chunks/ContentManager.js';
import { l as logger } from '../../../chunks/logger.server.js';
async function fetchAndRedirectToFirstCollection(language) {
	try {
		logger.debug(`Fetching first collection path for language: ${language}`);
		const firstCollection = await contentManager.getFirstCollection();
		if (firstCollection?.path) {
			const collectionPath = firstCollection.path.startsWith('/') ? firstCollection.path : `/${firstCollection.path}`;
			const redirectUrl = `/${language}${collectionPath}`;
			logger.info(`Redirecting to first collection: ${firstCollection.name} at path: ${redirectUrl}`);
			return redirectUrl;
		}
		logger.warn('No collections found via getFirstCollection(), returning null.');
		return null;
	} catch (err) {
		logger.error('Error in fetchAndRedirectToFirstCollection:', err);
		return null;
	}
}
const cachedFirstCollectionPaths = new SvelteMap();
const CACHE_DURATION = 5 * 60 * 1e3;
async function getCachedFirstCollectionPath(language) {
	const now = Date.now();
	const cachedEntry = cachedFirstCollectionPaths.get(language);
	if (cachedEntry && now < cachedEntry.expiry) {
		return cachedEntry.path;
	}
	const result = await fetchAndRedirectToFirstCollection(language);
	if (result) {
		cachedFirstCollectionPaths.set(language, { path: result, expiry: now + CACHE_DURATION });
	}
	return result;
}
const limiter = new RateLimiter({
	IP: [200, 'h'],
	// 200 requests per hour per IP
	IPUA: [100, 'm'],
	// 100 requests per minute per IP+User-Agent
	cookie: {
		name: 'ratelimit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY'),
		rate: [50, 'm'],
		// 50 requests per minute per cookie
		preflight: true
	}
});
const MIN_PPASSWORD_LENGTH = publicEnv.PASSWORD_LENGTH || 8;
const YELLOW_LENGTH = MIN_PPASSWORD_LENGTH + 3;
const GREEN_LENGTH = YELLOW_LENGTH + 4;
function calculatePasswordStrength(password) {
	if (password.length >= GREEN_LENGTH) return 3;
	if (password.length >= YELLOW_LENGTH) return 2;
	if (password.length >= MIN_PPASSWORD_LENGTH) return 1;
	return 0;
}
async function checkDatabaseHealth() {
	try {
		const { getSystemState, isServiceHealthy } = await import('../../../chunks/index8.js');
		const systemState = getSystemState();
		if (!isServiceHealthy('database')) {
			const dbStatus = systemState.services.database;
			return {
				healthy: false,
				reason: dbStatus.message || dbStatus.error || 'Database service is unhealthy'
			};
		}
		if (systemState.overallState === 'FAILED') {
			const lastFailure = systemState.performanceMetrics.stateTransitions
				.slice()
				.reverse()
				.find((t) => t.to === 'FAILED');
			if (lastFailure?.reason) {
				return { healthy: false, reason: lastFailure.reason };
			}
		}
		await dbInitPromise;
		const { auth: auth2 } = await import('../../../chunks/db.js').then((n) => n.e);
		if (!auth2) {
			return { healthy: false, reason: 'Authentication service not initialized' };
		}
		try {
			const roles = await auth2.getAllRoles();
			if (!roles || roles.length === 0) {
				return {
					healthy: false,
					reason: 'Database is empty - no roles found. Setup may not have completed successfully.'
				};
			}
		} catch (error) {
			return {
				healthy: false,
				reason: `Failed to query roles: ${error instanceof Error ? error.message : String(error)}`
			};
		}
		return { healthy: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return { healthy: false, reason: `Database connection error: ${errorMessage}` };
	}
}
async function waitForAuthService(maxWaitMs = 1e4) {
	const startTime = Date.now();
	logger$1.debug(`Waiting for auth service to be ready (timeout: ${maxWaitMs}ms)...`);
	while (Date.now() - startTime < maxWaitMs) {
		try {
			if (dbInitPromise) {
				const dbStatus = await Promise.race([dbInitPromise.then(() => 'ready'), new Promise((resolve) => setTimeout(() => resolve('timeout'), 100))]);
				if (dbStatus === 'timeout') {
					logger$1.debug('Database initialization still in progress...');
				}
			}
			if (auth && typeof auth.validateSession === 'function') {
				logger$1.debug(`Auth service ready after ${Date.now() - startTime}ms`);
				return true;
			}
			const elapsed = Date.now() - startTime;
			if (elapsed % 5e3 < 100) {
				logger$1.debug(
					`Auth service not ready yet, elapsed: ${elapsed}ms, auth: ${!!auth}, validateSession: ${auth && typeof auth.validateSession === 'function'}`
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		} catch (error) {
			logger$1.error(`Error while waiting for auth service: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	logger$1.error(`Auth service not ready after ${maxWaitMs}ms timeout`);
	return false;
}
async function shouldShowOAuth(hasInviteToken) {
	if (!publicEnv.USE_GOOGLE_OAUTH) {
		return false;
	}
	if (hasInviteToken) {
		return true;
	}
	try {
		await dbInitPromise;
		if (!auth) {
			logger$1.warn('Auth service not available for OAuth user check');
			return false;
		}
		return true;
	} catch (error) {
		logger$1.error('Error checking for OAuth availability:', error);
		return true;
	}
}
const load = async ({ url, cookies, fetch, request, locals }) => {
	const demoMode = getPrivateSettingSync('DEMO');
	const langFromStore = app.systemLanguage;
	const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE];
	const userLanguage = (langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : publicEnv.BASE_LOCALE) || 'en';
	try {
		const { getSystemState } = await import('../../../chunks/index8.js');
		const systemState = getSystemState();
		if (systemState.overallState === 'FAILED') {
			logger$1.error('System is in FAILED state, cannot proceed with login');
			const lastFailure = systemState.performanceMetrics.stateTransitions
				.slice()
				.reverse()
				.find((t) => t.to === 'FAILED');
			return {
				firstUserExists: true,
				showOAuth: false,
				hasExistingOAuthUsers: false,
				loginForm: {},
				forgotForm: {},
				resetForm: {},
				signUpForm: {},
				showDatabaseError: true,
				errorReason: lastFailure?.reason || 'System initialization failed. Please check the database connection and configuration.',
				canReset: true,
				authNotReady: true,
				authNotReadyMessage: lastFailure?.reason || 'System initialization failed. Please check the database connection and configuration.',
				demoMode
			};
		}
		await dbInitPromise;
		const dbHealth = await checkDatabaseHealth();
		if (!dbHealth.healthy) {
			logger$1.error(`Database health check failed: ${dbHealth.reason}`);
			return {
				firstUserExists: true,
				showOAuth: false,
				hasExistingOAuthUsers: false,
				loginForm: {},
				forgotForm: {},
				resetForm: {},
				signUpForm: {},
				showDatabaseError: true,
				errorReason: dbHealth.reason,
				canReset: true,
				authNotReady: true,
				authNotReadyMessage: dbHealth.reason
			};
		}
		const authReady = await waitForAuthService();
		if (!authReady || !auth) {
			logger$1.warn('Authentication system is not ready yet, checking if database is empty');
			const { isSetupCompleteAsync } = await import('../../../chunks/setupCheck.js');
			const setupComplete = await isSetupCompleteAsync();
			if (!setupComplete) {
				logger$1.error('Database is empty but config exists. This typically means the database was manually dropped.');
				return {
					firstUserExists: true,
					showOAuth: false,
					hasExistingOAuthUsers: false,
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					authNotReady: true,
					authNotReadyMessage: 'Database is empty. Please restore your database from backup or delete config/private.ts to run setup again.',
					demoMode
				};
			}
			return {
				firstUserExists: true,
				showOAuth: false,
				// Don't show OAuth if auth system isn't ready
				hasExistingOAuthUsers: false,
				loginForm: {},
				forgotForm: {},
				resetForm: {},
				signUpForm: {},
				authNotReady: true,
				authNotReadyMessage: 'System is still initializing. Please wait a moment and try again.',
				demoMode
			};
		}
		if (!locals) locals = {};
		if (locals.user) {
			logger$1.debug('User is already authenticated in load, attempting to redirect to collection');
			const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
			let redirectPath;
			if (finalCollectionPath) {
				redirectPath = finalCollectionPath;
				logger$1.debug(`Authenticated user redirect to collection: ${redirectPath}`);
			} else {
				logger$1.debug('No collections available for authenticated user, redirecting based on permissions');
				const { hasPermissionWithRoles } = await import('../../../chunks/permissions.js').then((n) => n.d);
				const isAdmin = hasPermissionWithRoles(locals.user, 'config:collectionbuilder', []);
				redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
			}
			throw redirect(302, redirectPath);
		}
		if (limiter.cookieLimiter?.preflight) {
			await limiter.cookieLimiter.preflight({ request, cookies });
		}
		const inviteToken = url.searchParams.get('invite_token');
		if (inviteToken) {
			const tokenData = await auth.validateRegistrationToken(inviteToken);
			if (tokenData.isValid && tokenData.details) {
				logger$1.info('Valid invite token detected. Preparing invite signup form.');
				const firstUserExists2 = locals.isFirstUser === false;
				const showOAuth2 = await shouldShowOAuth(true);
				return {
					firstUserExists: firstUserExists2,
					isInviteFlow: true,
					showOAuth: showOAuth2,
					hasExistingOAuthUsers: false,
					// Not relevant for invite flow
					token: inviteToken,
					invitedEmail: tokenData.details.email,
					roleId: tokenData.details.role,
					// Pass the roleId from the token
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					demoMode
				};
			} else {
				logger$1.warn('Invalid invite token detected, but allowing form access with pre-filled token.');
				const firstUserExists2 = locals.isFirstUser === false;
				const showOAuth2 = await shouldShowOAuth(true);
				const signUpForm2 = { token: inviteToken };
				return {
					firstUserExists: firstUserExists2,
					isInviteFlow: false,
					// Not a proper invite flow since token is invalid
					showOAuth: showOAuth2,
					hasExistingOAuthUsers: false,
					inviteError:
						'This invitation token appears to be invalid, expired, or already used. Please check with your administrator or enter a different token.',
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: signUpForm2,
					demoMode
				};
			}
		}
		const firstUserExists = locals.isFirstUser === false;
		logger$1.debug(`In load: firstUserExists determined as: ${firstUserExists} (based on locals.isFirstUser: ${locals.isFirstUser})`);
		const code = url.searchParams.get('code');
		logger$1.debug(`Authorization code from URL: ${code ?? 'none'}`);
		if (publicEnv.USE_GOOGLE_OAUTH && code) {
			logger$1.debug('Entering Google OAuth flow in load function');
			try {
				const googleAuthInstance = await googleAuth();
				if (!googleAuthInstance) throw Error('Google OAuth client is not initialized');
				logger$1.debug('Fetching tokens using authorization code...');
				const { tokens } = await googleAuthInstance.getToken(code);
				if (!tokens) throw new Error('Failed to retrieve Google OAuth tokens.');
				googleAuthInstance.setCredentials(tokens);
				const oauth2 = google.oauth2('v2');
				oauth2.context._options.auth = googleAuthInstance;
				const { data: googleUser } = await oauth2.userinfo.get();
				logger$1.debug(`Google user information: ${JSON.stringify(googleUser)}`);
				const stateParam = url.searchParams.get('state');
				const inviteToken2 = stateParam ? decodeURIComponent(stateParam) : null;
				if (!auth) {
					throw new Error('Auth service is not initialized');
				}
				const getUser = async () => {
					const email = googleUser.email;
					if (!email) throw Error('Google did not return an email address.');
					const existingUser = await auth.checkUser({ email });
					if (existingUser) return [existingUser, false];
					if (!inviteToken2) {
						logger$1.warn('OAuth registration attempt without invite token in state');
						return [null, false];
					}
					const tokenData = await auth.validateRegistrationToken(inviteToken2);
					if (!tokenData.isValid || !tokenData.details) {
						logger$1.warn('Invalid/expired invite token used in OAuth registration');
						return [null, false];
					}
					if (tokenData.details.email.toLowerCase() !== email.toLowerCase()) {
						logger$1.warn('Invite token email mismatch in OAuth registration', {
							tokenEmail: tokenData.details.email,
							googleEmail: email
						});
						return [null, false];
					}
					const roleId = tokenData.details.role || 'user';
					const newUser = await auth.createUser({
						email,
						username: googleUser.name || email.split('@')[0],
						role: roleId,
						permissions: [],
						isRegistered: true,
						lastAuthMethod: 'google'
					});
					await auth.consumeRegistrationToken(inviteToken2);
					logger$1.info(`OAuth: Invited user created: ${newUser?.username}`);
					const emailProps = {
						username: googleUser.name || newUser?.username || '',
						email,
						hostLink: publicEnv.HOST_PROD || `https://${request.headers.get('host')}`,
						sitename: publicEnv.SITE_NAME || 'SveltyCMS'
					};
					try {
						const mailResponse = await fetch('/api/sendMail', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								recipientEmail: email,
								subject: `Welcome to ${emailProps.sitename}`,
								templateName: 'welcomeUser',
								props: emailProps,
								languageTag: app.systemLanguage
							})
						});
						if (!mailResponse.ok) {
							logger$1.error(`OAuth: Failed to send welcome email to invited user via API. Status: ${mailResponse.status}`, {
								email,
								responseText: await mailResponse.text()
							});
						} else {
							logger$1.info(`OAuth: Welcome email request sent to invited user via API`, { email });
						}
					} catch (emailError) {
						logger$1.error(`OAuth: Error fetching /api/sendMail for invited user`, { email, error: emailError });
					}
					return [newUser, false];
				};
				const [user] = await getUser();
				if (user && user._id) {
					await createSessionAndSetCookie(user._id, cookies);
					await auth.updateUserAttributes(user._id, { lastAuthMethod: 'google' });
					const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
					let redirectPath;
					if (finalCollectionPath) {
						redirectPath = finalCollectionPath;
						logger$1.debug(`OAuth login redirect to collection: ${redirectPath}`);
					} else {
						logger$1.debug('No collections available for OAuth login, redirecting based on permissions');
						const { hasPermissionWithRoles } = await import('../../../chunks/permissions.js').then((n) => n.d);
						const isAdmin = hasPermissionWithRoles(user, 'config:collectionbuilder', []);
						redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
					}
					throw redirect(303, redirectPath);
				}
				logger$1.warn(`OAuth: User processing ended without session creation for ${googleUser.email}.`);
				const showOAuth2 = await shouldShowOAuth(false);
				return {
					isInviteFlow: false,
					firstUserExists,
					showOAuth: showOAuth2,
					hasExistingOAuthUsers: false,
					// Not relevant for error case
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					oauthError: 'OAuth processing failed. Please try signing in with email or contact support.',
					demoMode
				};
			} catch (oauthError) {
				if (oauthError instanceof Response && oauthError.status >= 300 && oauthError.status < 400) {
					throw oauthError;
				}
				const err = oauthError;
				logger$1.error(`Error during Google OAuth login process: ${err.message}`, { stack: err.stack });
				const showOAuth2 = await shouldShowOAuth(false);
				return {
					isInviteFlow: false,
					firstUserExists,
					showOAuth: showOAuth2,
					hasExistingOAuthUsers: false,
					// Not relevant for error case
					loginForm: {},
					forgotForm: {},
					resetForm: {},
					signUpForm: {},
					oauthError: `OAuth failed: ${err.message}. Please try again or use email login.`,
					demoMode
				};
			}
		}
		const loginForm = {};
		const forgotForm = {};
		const resetForm = {};
		const signUpForm = {};
		const showOAuth = await shouldShowOAuth(false);
		let hasExistingOAuthUsers = false;
		try {
			if (auth) {
				const count = await auth.getUserCount();
				hasExistingOAuthUsers = count > 0;
			}
		} catch (error) {
			logger$1.error('Error checking for existing OAuth users:', error);
		}
		const firstCollectionPath = await getCachedFirstCollectionPath(userLanguage);
		return {
			isInviteFlow: false,
			firstUserExists,
			showOAuth,
			hasExistingOAuthUsers,
			loginForm,
			forgotForm,
			resetForm,
			signUpForm,
			pkgVersion: publicEnv.PKG_VERSION || '0.0.0',
			demoMode,
			firstCollectionPath
		};
	} catch (initialError) {
		const err = initialError;
		if (err instanceof Response && err.status === 302) throw err;
		logger$1.error(`Critical error in load function: ${err.message}`, { stack: err.stack });
		return {
			isInviteFlow: false,
			firstUserExists: true,
			showOAuth: false,
			// Don't show OAuth in error case
			hasExistingOAuthUsers: false,
			firstCollection: null,
			// No collection info in error case
			loginForm: {},
			forgotForm: {},
			resetForm: {},
			signUpForm: {},
			error: 'The login system encountered an unexpected error. Please try again later.',
			pkgVersion: publicEnv.PKG_VERSION || '0.0.0',
			demoMode
		};
	}
};
const actions = {
	signUp: async (event) => {
		const langFromStore = app.systemLanguage;
		const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en'];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : publicEnv.BASE_LOCALE || 'en';
		logger$1.debug(`Validated user language for sign-up: ${userLanguage}`);
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}
		try {
			await dbInitPromise;
			logger$1.debug('Database initialization completed for signUp');
		} catch (error) {
			logger$1.error('Database initialization failed for signUp:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}
		const authReady = await waitForAuthService(1e4);
		if (!authReady || !auth) {
			logger$1.error('Authentication system is not ready for signUp action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}
		logger$1.debug('Auth service is ready for signUp action');
		const formData = await event.request.formData();
		const form = Object.fromEntries(formData);
		const result = safeParse(signUpFormSchema, form);
		if (!result.success) {
			logger$1.warn('SignUp form invalid:', { errors: result.issues });
			return fail(400, { form, errors: flatten(result.issues).nested });
		}
		const { email, username, password, token } = result.output;
		if (!token) {
			if (!token) {
				return fail(403, { message: 'A valid invitation is required to create an account.', form });
			}
		}
		const tokenData = await auth.validateRegistrationToken(token);
		if (!tokenData.isValid || !tokenData.details) {
			if (!tokenData.isValid || !tokenData.details) {
				return fail(403, { message: 'This invitation is invalid, expired, or has already been used.', form });
			}
		}
		logger$1.debug('Token validation result:', {
			tokenData: tokenData.details,
			role: tokenData.details.role,
			email: tokenData.details.email
		});
		if (email.toLowerCase() !== tokenData.details.email.toLowerCase()) {
			if (email.toLowerCase() !== tokenData.details.email.toLowerCase()) {
				return fail(403, { message: 'The provided email does not match the invitation.', form });
			}
		}
		try {
			const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
			const userAndSessionResult = await auth.createUserAndSession(
				{
					email,
					username,
					password,
					role: tokenData.details.role || 'user',
					// Use the role from the token with fallback to 'user'
					isRegistered: true,
					lastAuthMethod: 'password',
					lastActiveAt: /* @__PURE__ */ new Date().toISOString()
				},
				{
					expires: sessionExpires.toISOString()
				}
			);
			if (!userAndSessionResult.success || !userAndSessionResult.data) {
				const errorMessage =
					!userAndSessionResult.success && 'error' in userAndSessionResult
						? userAndSessionResult.error?.message
						: 'Failed to create user and session';
				throw new Error(errorMessage);
			}
			const { user: newUser, session: newSession } = userAndSessionResult.data;
			logger$1.info('User and session created successfully via token registration', {
				userId: newUser._id,
				sessionId: newSession._id,
				email
			});
			invalidateUserCountCache();
			await auth.consumeRegistrationToken(token);
			try {
				const emailProps = {
					username: username || email,
					email,
					hostLink: publicEnv.HOST_PROD || `https://${event.request.headers.get('host')}`,
					sitename: publicEnv.SITE_NAME || 'SveltyCMS'
				};
				const mailResponse = await event.fetch('/api/sendMail', {
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
				if (!mailResponse.ok) {
					logger$1.error(`Failed to send welcome email via API. Status: ${mailResponse.status}`, {
						email,
						responseText: await mailResponse.text()
					});
				} else {
					logger$1.info(`Welcome email request sent via API`, { email });
				}
			} catch (emailError) {
				logger$1.error(`Error invoking /api/sendMail for invited user`, { email, error: emailError });
			}
			const SESSION_COOKIE_NAME = 'sid';
			event.cookies.set(SESSION_COOKIE_NAME, newSession._id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: dev ? false : true,
				maxAge: 60 * 60 * 24 * 7
				// 7 days to match session expiry
			});
			const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
			let redirectPath;
			if (finalCollectionPath) {
				redirectPath = finalCollectionPath;
				logger$1.debug(`SignUp redirect to collection: ${redirectPath}`);
			} else {
				logger$1.debug('No collections available for signUp, redirecting based on permissions');
				const { hasPermissionByAction } = await import('../../../chunks/permissions.js').then((n) => n.d);
				const isAdmin = hasPermissionByAction(newUser, 'manage', 'system', 'config:collectionbuilder');
				redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
			}
			throw redirect(303, redirectPath);
		} catch (error) {
			const err = error;
			logger$1.error('Error during invited user signup', { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'Failed to create account. Please try again later.', form });
		}
	},
	signInOAuth: async (event) => {
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		const inviteToken = event.url.searchParams.get('invite_token');
		const authUrl = await generateGoogleAuthUrl(inviteToken, void 0);
		throw redirect(303, authUrl);
	},
	signIn: async (event) => {
		const langFromStore = app.systemLanguage;
		const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en'];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : publicEnv.BASE_LOCALE || 'en';
		logger$1.debug(`Validated user language for sign-in: ${userLanguage}`);
		const startTime = performance.now();
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}
		try {
			await dbInitPromise;
			logger$1.debug('Database initialization completed for signIn');
		} catch (error) {
			logger$1.error('Database initialization failed for signIn:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}
		const authReady = await waitForAuthService(1e4);
		if (!authReady || !auth) {
			logger$1.error('Authentication system is not ready for signIn action after waiting');
			return fail(503, {
				message: 'Authentication system is not ready. Please wait a moment and try again.'
			});
		}
		logger$1.debug('Auth service is ready for signIn action');
		const formData = await event.request.formData();
		const emailRaw = formData.get('email')?.toString() ?? '';
		const passwordRaw = formData.get('password')?.toString() ?? '';
		const isTokenRaw = formData.get('isToken');
		const isToken = isTokenRaw === 'true' || isTokenRaw === 'on';
		const form = { email: emailRaw, password: passwordRaw, isToken };
		const result = safeParse(loginFormSchema, form);
		if (!result.success) return fail(400, { form, errors: flatten(result.issues).nested });
		const { email, password } = result.output;
		let resp;
		let redirectPath;
		try {
			const authResult = await signInUser(email, password, isToken, event.cookies);
			resp = authResult;
			if (resp && resp.requires2FA) {
				logger$1.debug('2FA verification required for user', { userId: resp.userId });
				return fail(401, {
					requires2FA: true,
					userId: resp.userId,
					message: 'Please enter your 2FA code to continue.'
				});
			} else if (resp && resp.status) {
				const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
				if (finalCollectionPath) {
					redirectPath = finalCollectionPath;
					logger$1.debug(`Login redirect to collection: ${redirectPath}`);
				} else {
					logger$1.debug('No collections available, redirecting based on permissions');
					const { hasPermissionByAction } = await import('../../../chunks/permissions.js').then((n) => n.d);
					if (resp.user) {
						const isAdmin = hasPermissionByAction(resp.user, 'manage', 'system', 'config:collectionbuilder');
						redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
					} else {
						redirectPath = '/user';
					}
				}
				const endTime = performance.now();
				logger$1.debug(`SignIn completed in ${(endTime - startTime).toFixed(2)}ms`);
			} else {
				const errorMessage = resp?.message || 'Invalid credentials or an error occurred.';
				logger$1.warn(`Sign-in failed`, { email, errorMessage });
				const errorMsg = resp?.message || 'Invalid credentials or an error occurred.';
				logger$1.warn(`Sign-in failed`, { email, errorMsg });
				return fail(401, { message: errorMessage, form });
			}
		} catch (e) {
			const err = e;
			logger$1.error(`Unexpected error in signIn action`, { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'An unexpected server error occurred.', form });
		}
		if (redirectPath) {
			throw redirect(303, redirectPath);
		}
	},
	verify2FA: async (event) => {
		const langFromStore = app.systemLanguage;
		const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : publicEnv.BASE_LOCALE;
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests. Please try again later.' });
		}
		try {
			await dbInitPromise;
			logger$1.debug('Database initialization completed for verify2FA');
		} catch (error) {
			logger$1.error('Database initialization failed for verify2FA:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}
		const authReady = await waitForAuthService(1e4);
		if (!authReady || !auth) {
			logger$1.error('Authentication system is not ready for verify2FA action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}
		logger$1.debug('Auth service is ready for verify2FA action');
		try {
			const formData = await event.request.formData();
			const userId = formData.get('userId');
			const code = formData.get('code');
			if (!userId || !code) {
				return fail(400, { message: 'Missing required fields.' });
			}
			const { getDefaultTwoFactorAuthService } = await import('../../../chunks/twoFactorAuth.js');
			if (!auth) {
				return fail(500, { message: 'Auth service is not initialized' });
			}
			const twoFactorService = getDefaultTwoFactorAuthService(auth);
			const result = await twoFactorService.verify2FA(userId, code);
			if (!result.success) {
				logger$1.warn('2FA verification failed during login', { userId, reason: result.message });
				return fail(400, { message: result.message });
			}
			const user = await auth.getUserById(userId);
			if (!user) {
				logger$1.error('User not found after successful 2FA verification', { userId });
				return fail(500, { message: 'User not found.' });
			}
			await createSessionAndSetCookie(userId, event.cookies);
			const updatePromise = auth.updateUserAttributes(userId, {
				lastAuthMethod: 'password+2fa',
				lastActiveAt: /* @__PURE__ */ new Date().toISOString()
			});
			updatePromise.catch((err) => {
				logger$1.error(`Failed to update user attributes after 2FA login for ${userId}:`, err);
			});
			logger$1.info(`User logged in successfully with 2FA: ${user.username} (${userId})`);
			const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
			let redirectPath;
			if (finalCollectionPath) {
				redirectPath = finalCollectionPath;
				logger$1.debug(`2FA login redirect to collection: ${redirectPath}`);
			} else {
				logger$1.debug('No collections available for 2FA login, redirecting based on permissions');
				const { hasPermissionByAction } = await import('../../../chunks/permissions.js').then((n) => n.d);
				const isAdmin = hasPermissionByAction(user, 'manage', 'system', 'config:collectionbuilder');
				redirectPath = isAdmin ? '/config/collectionbuilder' : '/user';
			}
			throw redirect(303, redirectPath);
		} catch (e) {
			if (e instanceof Response) {
				throw e;
			}
			const err = e;
			logger$1.error(`Unexpected error in verify2FA action`, { message: err.message, stack: err.stack });
			return fail(500, { message: 'An unexpected server error occurred.' });
		}
	},
	forgotPW: async (event) => {
		const langFromStore = app.systemLanguage;
		const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en'];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : publicEnv.BASE_LOCALE || 'en';
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		try {
			await dbInitPromise;
			logger$1.debug('Database initialization completed for forgotPW');
		} catch (error) {
			logger$1.error('Database initialization failed for forgotPW:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}
		const authReady = await waitForAuthService(1e4);
		if (!authReady || !auth) {
			logger$1.error('Authentication system is not ready for forgotPW action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}
		logger$1.debug('Auth service is ready for forgotPW action');
		const formData = await event.request.formData();
		const form = Object.fromEntries(formData);
		const result = safeParse(forgotFormSchema, form);
		if (!result.success) return fail(400, { form, errors: flatten(result.issues).nested });
		const email = result.output.email.toLowerCase().trim();
		let checkMail;
		try {
			checkMail = await forgotPWCheck(email);
			if (checkMail.success && checkMail.token && checkMail.expiresIn) {
				const baseUrl = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;
				const resetLink = `${baseUrl}/login?token=${checkMail.token}&email=${encodeURIComponent(email)}`;
				logger$1.debug(`Reset link generated: ${resetLink}`);
				const emailProps = {
					email,
					token: checkMail.token,
					expiresIn: checkMail.expiresIn,
					resetLink,
					username: checkMail.username || email,
					sitename: publicEnv.SITE_NAME || 'SveltyCMS'
				};
				const mailResponse = await event.fetch('/api/sendMail', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						recipientEmail: email,
						subject: `Password Reset Request for ${emailProps.sitename}`,
						templateName: 'forgottenPassword',
						props: emailProps,
						languageTag: userLanguage
					})
				});
				if (!mailResponse.ok) {
					logger$1.error(`Failed to send forgotten password email via API. Status: ${mailResponse.status}`, {
						email,
						responseText: await mailResponse.text()
					});
					return fail(400, { message: 'Password reset email sent successfully.', userExists: true, emailSent: false });
				} else {
					logger$1.info(`Forgotten password email request sent via API`, { email });
					return fail(400, { message: 'Password reset email sent successfully.', userExists: true, emailSent: true });
				}
			} else {
				logger$1.warn(`Forgotten password check failed`, { email, message: checkMail.message });
				return fail(400, { message: 'User does not exist.', userExists: false });
			}
		} catch (e) {
			const err = e;
			logger$1.error(`Error in forgotPW action`, { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'An error occurred. Please try again.', form });
		}
	},
	resetPW: async (event) => {
		const langFromStore = app.systemLanguage;
		const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE || 'en'];
		const userLanguage = langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : publicEnv.BASE_LOCALE || 'en';
		if (await limiter.isLimited(event)) {
			return fail(429, { message: 'Too many requests.' });
		}
		try {
			await dbInitPromise;
			logger$1.debug('Database initialization completed for resetPW');
		} catch (error) {
			logger$1.error('Database initialization failed for resetPW:', error);
			return fail(503, { message: 'Database system is not ready.' });
		}
		const authReady = await waitForAuthService(1e4);
		if (!authReady || !auth) {
			logger$1.error('Authentication system is not ready for resetPW action');
			return fail(503, { message: 'Authentication system is not ready.' });
		}
		logger$1.debug('Auth service is ready for resetPW action');
		const formData = await event.request.formData();
		const form = Object.fromEntries(formData);
		const result = safeParse(resetFormSchema, form);
		if (!result.success) return fail(400, { form, errors: flatten(result.issues).nested });
		const { password, token, email } = result.output;
		try {
			const resp = await resetPWCheck(password, token, email);
			logger$1.debug(`Password reset check response`, { email, response: JSON.stringify(resp) });
			if (resp.status) {
				const emailProps = {
					username: resp.username || email,
					email,
					hostLink: publicEnv.HOST_PROD || `https://${event.request.headers.get('host')}`,
					sitename: publicEnv.SITE_NAME || 'SveltyCMS'
				};
				try {
					const mailResponse = await event.fetch('/api/sendMail', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							recipientEmail: email,
							subject: `Your Password for ${emailProps.sitename} Has Been Updated`,
							templateName: 'updatedPassword',
							// Ensure this template exists
							props: emailProps,
							languageTag: userLanguage
						})
					});
					if (!mailResponse.ok) {
						logger$1.error(`Failed to send password updated email via API. Status: ${mailResponse.status}`, {
							email,
							responseText: await mailResponse.text()
						});
					} else {
						logger$1.info(`Password updated confirmation email request sent via API`, { email });
					}
				} catch (emailError) {
					logger$1.error(`Error fetching /api/sendMail for password updated confirmation`, { email, error: emailError });
				}
				throw redirect(303, '/login?reset=success');
			} else {
				logger$1.warn(`Password reset failed`, { email, message: resp.message });
				return fail(400, { message: resp.message || 'Password reset failed. The link may be invalid or expired.', form });
			}
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e && (e.status === 302 || e.status === 303)) {
				throw e;
			}
			const err = e;
			logger$1.error(`Error in resetPW action`, { email, message: err.message, stack: err.stack });
			return fail(500, { message: 'An unexpected error occurred during password reset.', form });
		}
	},
	prefetch: async () => {
		const langFromStore = app.systemLanguage;
		const supportedLocales = publicEnv.LOCALES || [publicEnv.BASE_LOCALE];
		const userLanguage = (langFromStore && supportedLocales.includes(langFromStore) ? langFromStore : publicEnv.BASE_LOCALE) || 'en';
		try {
			logger$1.info(`Collection lookup triggered for language: ${userLanguage}`);
			const firstCollectionSchema = await contentManager.getFirstCollection();
			const collectionInfo = firstCollectionSchema
				? {
						collectionId: firstCollectionSchema._id,
						name: firstCollectionSchema.name,
						path: firstCollectionSchema.path
					}
				: null;
			if (collectionInfo) {
				logger$1.info(`Collection lookup completed successfully: ${collectionInfo.name}`);
				return { success: true, collection: collectionInfo };
			} else {
				logger$1.debug('No collection found');
				return { success: false, error: 'No collection available' };
			}
		} catch (err) {
			logger$1.debug('Collection lookup failed:', err);
			return { success: false, error: 'Collection lookup failed' };
		}
	}
};
async function createSessionAndSetCookie(user_id, cookies) {
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
	if (!auth) throw Error('Auth service is not initialized when creating session.');
	const session = await auth.createSession({ user_id, expires: expiresAt.toISOString() });
	logger$1.debug(`Session created: ${session._id} for user ${user_id}`);
	const sessionCookie = auth.createSessionCookie(session._id);
	const attributes = sessionCookie.attributes;
	cookies.set(sessionCookie.name, sessionCookie.value, { ...attributes, path: '/' });
}
async function signInUser(email, password, isToken, cookies) {
	logger$1.debug(`signInUser called`, { email, isToken });
	if (!auth) {
		logger$1.error('Auth system not initialized for signInUser');
		return { status: false, message: 'Authentication system unavailable.' };
	}
	try {
		let user = null;
		let authSuccess = false;
		if (!isToken) {
			const authResult = await auth.authenticate(email, password);
			if (authResult && authResult.user) {
				user = authResult.user;
				if (user.is2FAEnabled) {
					logger$1.debug(`User has 2FA enabled, requiring 2FA verification`, { userId: user._id });
					return {
						status: false,
						message: '2FA verification required',
						requires2FA: true,
						userId: user._id
					};
				}
				authSuccess = true;
				const sessionCookie = auth.createSessionCookie(authResult.sessionId);
				cookies.set(sessionCookie.name, sessionCookie.value, { ...sessionCookie.attributes, path: '/' });
			} else {
				logger$1.warn(`Password authentication failed`, { email });
			}
		} else {
			const tokenValue = password;
			const tempUser = await auth.checkUser({ email });
			if (!tempUser) {
				logger$1.warn(`Token login attempt for non-existent user`, { email });
				return { status: false, message: 'User does not exist.' };
			}
			const result = await auth.consumeToken(tokenValue, tempUser._id);
			if (result.status) {
				user = tempUser;
				authSuccess = true;
			} else {
				logger$1.warn(`Token consumption failed`, { email, message: result.message });
				return { status: false, message: result.message || 'Invalid or expired token.' };
			}
		}
		if (!authSuccess || !user || !user._id) {
			return { status: false, message: 'Invalid credentials or authentication failed.' };
		}
		if (isToken) {
			await createSessionAndSetCookie(user._id, cookies);
		}
		const updatePromise = auth.updateUserAttributes(user._id, {
			lastAuthMethod: isToken ? 'token' : 'password',
			lastActiveAt: /* @__PURE__ */ new Date().toISOString()
		});
		updatePromise.catch((err) => {
			logger$1.error(`Failed to update user attributes for ${user._id}:`, err);
		});
		logger$1.info(`User logged in successfully: ${user.username} (${user._id})`);
		return { status: true, message: 'Login successful', user };
	} catch (error) {
		const err = error;
		logger$1.error(`Error in signInUser`, { email, message: err.message, stack: err.stack });
		return { status: false, message: 'An internal error occurred during sign-in.' };
	}
}
async function forgotPWCheck(email) {
	logger$1.debug(`forgotPWCheck called`, { email });
	if (!auth) {
		logger$1.error('Auth system not initialized for forgotPWCheck');
		return { success: false, message: 'Authentication system unavailable.' };
	}
	try {
		const user = await auth.checkUser({ email });
		if (!user || !user._id) {
			logger$1.warn(`forgotPWCheck: User not found`, { email });
			return { success: false, message: 'User does not exist.' };
		}
		const expiresInMs = 1 * 60 * 60 * 1e3;
		const expiresAt = new Date(Date.now() + expiresInMs);
		const token = await auth.createToken({
			user_id: user._id,
			expires: expiresAt.toISOString(),
			type: 'password_reset'
		});
		logger$1.info(`Password reset token created`, { email });
		return { success: true, message: 'Password reset token generated.', token, expiresIn: expiresAt, username: user.username };
	} catch (error) {
		const err = error;
		logger$1.error(`Error in forgotPWCheck`, { email, message: err.message, stack: err.stack });
		return { success: false, message: 'An internal error occurred generating password reset token.' };
	}
}
async function resetPWCheck(password, token, email) {
	logger$1.debug(`resetPWCheck called`, { email });
	if (!auth) {
		logger$1.error('Auth system not initialized for resetPWCheck');
		return { status: false, message: 'Authentication system unavailable.' };
	}
	try {
		const user = await auth.checkUser({ email });
		if (!user || !user._id) {
			logger$1.warn(`resetPWCheck: User not found for token validation`, { email });
			return { status: false, message: 'Invalid or expired reset link (user not found).' };
		}
		const validate = await auth.consumeToken(token, user._id, 'password_reset');
		if (!validate.status) {
			logger$1.warn(`resetPWCheck: Token consumption failed`, { email, message: validate.message });
			return { status: false, message: validate.message || 'Invalid or expired reset link.' };
		}
		if (calculatePasswordStrength(password) < 1) {
			return { status: false, message: 'Password is too weak.' };
		}
		await auth.invalidateAllUserSessions(user._id);
		const updateResult = await auth.updateUserPassword(email, password);
		if (!updateResult.status) {
			logger$1.warn(`resetPWCheck: Password update failed`, { email, message: updateResult.message });
			return { status: false, message: updateResult.message || 'Failed to update password.' };
		}
		logger$1.info(`Password reset successfully`, { email });
		return { status: true, username: user.username };
	} catch (error) {
		const err = error;
		logger$1.error(`Error in resetPWCheck`, { email, message: err.message, stack: err.stack });
		return { status: false, message: 'An internal error occurred during password reset.' };
	}
}
export { actions, load };
//# sourceMappingURL=_page.server.ts.js.map
