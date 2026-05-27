/**
 * @file src/routes/api/auth/saml/acs/+server.ts
 * @description SAML 2.0 Assertion Consumer Service (ACS) Callback Endpoint
 *
 * Features:
 * - SAML 2.0 Assertion Consumer Service (ACS) Callback Endpoint
 * - Processes SAML responses from Identity Providers
 * - Supports Just-In-Time (JIT) provisioning
 * - Rate limiting to prevent abuse
 * - Multi-tenant support
 */

import { getJackson } from '@src/databases/auth/saml-auth';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { redirect } from '@sveltejs/kit';
import type { ISODateString } from '@src/content/types';

// Rate Limiter tracking (in-memory for ACS endpoints)
const rateLimits = new Map<string, { count: number; expires: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 10;

async function getAuth() {
	const { auth, dbInitPromise } = await import('@src/databases/db');
	await dbInitPromise;
	if (!auth) {
		throw new AppError('Authentication service not initialized', 500, 'AUTH_NOT_INITIALIZED');
	}
	return auth;
}

export async function POST({ request, cookies }) {
	const ip = request.headers.get('x-forwarded-for') || 'unknown';
	const now = Date.now();

	// Rate Limiting Logic
	const clientLimit = rateLimits.get(ip) || { count: 0, expires: now + RATE_LIMIT_WINDOW_MS };
	if (now > clientLimit.expires) {
		clientLimit.count = 1;
		clientLimit.expires = now + RATE_LIMIT_WINDOW_MS;
	} else {
		clientLimit.count++;
	}
	rateLimits.set(ip, clientLimit);

	if (clientLimit.count > MAX_ATTEMPTS) {
		logger.warn(`Rate limit exceeded for SAML ACS from IP: ${ip}`);
		throw new AppError('Too many authentication attempts', 429, 'RATE_LIMIT_EXCEEDED');
	}

	try {
		const formData = await request.formData();
		const relayState = formData.get('RelayState')?.toString() || '';
		const samlResponse = formData.get('SAMLResponse')?.toString();

		if (!samlResponse) {
			throw new AppError('Missing SAMLResponse', 400, 'SAML_MISSING_RESPONSE');
		}

		const j = await getJackson();
		const body = {
			SAMLResponse: samlResponse,
			RelayState: relayState
		};

		// 1. Process SAML Response (Jackson validates signature, audience, expiration, etc.)
		const { profile } = await j.oauthController.samlResponse(body);

		const email = profile.email?.toLowerCase();
		const samlId = profile.id;
		const tenantId = profile.requested.tenant || 'default';
		const firstName = profile.firstName || '';
		const lastName = profile.lastName || '';

		if (!email || !samlId) {
			throw new AppError('SAML response missing critical profile data (email or ID)', 400, 'SAML_INVALID_PROFILE');
		}

		logger.info(`SAML SSO successful for identity: ${email}`);

		const auth = await getAuth();
		let user = await auth.getUserBySamlId(samlId, getPrivateSettingSync('MULTI_TENANT') ? tenantId : null);

		// Fallback to searching by email if SAML ID not linked yet
		if (!user) {
			user = await auth.getUserByEmail({ email, tenantId: getPrivateSettingSync('MULTI_TENANT') ? tenantId : null });

			// If user exists but is not linked to SAML, reject to prevent hijacking unless explicitly allowed
			if (user && user.samlId && user.samlId !== samlId) {
				logger.error(`SAML email collision attempt detected for email: ${email}`);
				throw new AppError('Account linked to another identity provider', 403, 'SAML_IDENTITY_COLLISION');
			}
		}

		// 2. Just-In-Time (JIT) Provisioning
		if (!user) {
			// Check if JIT is enabled (e.g., via config/private env variable SAML_JIT_PROVISIONING)
			const jitEnabled = getPrivateSettingSync('SAML_JIT_PROVISIONING') ?? false;
			if (!jitEnabled) {
				logger.warn(`SAML user auto-provisioning is disabled. Access denied for: ${email}`);
				throw new AppError('Account not found and auto-provisioning is disabled', 403, 'SAML_JIT_DISABLED');
			}

			logger.info(`Provisioning new user via SAML JIT: ${email}`);
			user = await auth.createUser(
				{
					email,
					firstName,
					lastName,
					role: 'VIEWER', // Default role. Could be made configurable.
					samlId,
					samlProvider: 'saml-jackson',
					...(getPrivateSettingSync('MULTI_TENANT') && { tenantId })
				},
				true
			);
		}

		if (user.blocked) {
			logger.warn(`Blocked user attempted SAML login: ${email}`);
			throw new AppError('Your account has been suspended', 403, 'USER_BLOCKED');
		}

		// 3. Create Session
		const session = await auth.createSession({
			user_id: user._id,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }),
			expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString
		});

		const sessionCookie = auth.createSessionCookie(session._id);

		// Enforce Strict Cookie Security Settings
		const attributes = sessionCookie.attributes || {};
		cookies.set(sessionCookie.name, sessionCookie.value, {
			...attributes,
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/'
		});

		throw redirect(302, '/admin');
	} catch (error) {
		if (error instanceof Response && error.status === 302) {
			throw error; // Standard SvelteKit redirect
		}
		logger.error('SAML ACS processing error:', error);
		if (error instanceof AppError) throw error;
		throw new AppError('Failed to process Enterprise SSO', 500, 'SAML_PROCESSING_FAILED');
	}
}
