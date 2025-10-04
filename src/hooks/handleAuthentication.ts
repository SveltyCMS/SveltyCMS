/**
 * @file src/hooks/handleAuthentication.ts
 * @description Middleware for session validation and user identification
 *
 * @summary This hook reads the session cookie, validates it, and attaches the
 * user object to `event.locals`. It also handles multi-tenancy identification
 * and attaches the database adapter for use in subsequent hooks and endpoints.
 */

import { privateEnv } from '@src/stores/globalSettings';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';
import { auth, dbAdapter, dbInitPromise } from '@src/databases/db';
import { error, type Handle } from '@sveltejs/kit';
import { getTenantIdFromHostname } from './utils/tenant';

export const handleAuthentication: Handle = async ({ event, resolve }) => {
	const { locals, url } = event;

	// Wait for the database connection to be ready.
	await dbInitPromise;

	// Attach the database adapter to locals for universal access.
	locals.dbAdapter = dbAdapter;

	// Handle multi-tenancy if enabled.
	if (privateEnv.MULTI_TENANT) {
		const tenantId = getTenantIdFromHostname(url.hostname);
		if (!tenantId) {
			throw error(404, `Tenant not found for hostname: ${url.hostname}`);
		}
		locals.tenantId = tenantId;
	}

	// Validate the session and retrieve the user.
	const sessionId = event.cookies.get(SESSION_COOKIE_NAME);
	if (sessionId) {
		const user = await auth.validateSession(sessionId);
		if (user) {
			locals.user = user;
			locals.session_id = sessionId;
		}
	}

	// Continue to the next hook in the sequence.
	return resolve(event);
};
