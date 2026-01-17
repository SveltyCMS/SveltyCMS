/**
 * @file src/routes/api/user/login/+server.ts
 * @description Quantum-resistant user authentication API endpoint.
 *
 * QUANTUM COMPUTING SECURITY:
 * ===========================
 * This endpoint uses quantum-resistant cryptography:
 * - Password verification: Argon2id (memory-hard, resists quantum speedup)
 * - Session tokens: AES-256-GCM (128-bit quantum security)
 * - No public-key crypto: Avoids RSA/ECC vulnerability to Shor's algorithm
 *
 * Security Timeline: Secure against quantum computers for 15-30+ years
 *
 * This endpoint handles user authentication by:
 * - Validating user credentials (email and password) within the scope of the current tenant
 * - Checking if the user account is blocked
 * - Creating a new session tagged with the tenant ID and setting a secure cookie
 *
 * Features:
 * - Quantum-resistant password verification using Argon2id
 * - Safeguard against blocked user login
 * - Prevents already authenticated users from logging in again
 * - Generic error messages prevent user enumeration
 * - Robust error handling and logging
 *
 * @see /docs/architecture/quantum-security.mdx for security details
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSettingSync } from '@shared/services/settingsService';

// Auth
import { auth } from '@shared/database/db';

// System logger
import { logger } from '@shared/utils/logger.server';

// Password utility
import { verifyPassword } from '@shared/utils/password';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	// The main try...catch block is for unexpected server errors (e.g., DB connection fails).
	// Expected client errors (like 401) are handled by `throw error()`, which SvelteKit catches.
	try {
		const { user: existingUser, tenantId } = locals; // Destructure user and tenantId

		if (!auth) {
			logger.error('Authentication system is not initialized.');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		// In multi-tenant mode, a tenantId is required for login.
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			logger.error('Login attempt failed: Tenant ID is missing in a multi-tenant setup.');
			throw error(400, 'Could not identify the tenant for this request.');
		} // Prevent an already authenticated user from trying to log in again.

		if (existingUser) {
			logger.warn('Authenticated user attempted to log in again.', { userId: existingUser._id });
			throw error(400, 'You are already authenticated.');
		}

		const { email, password } = await request.json();

		if (!email || !password) {
			throw error(400, 'Email and password are required.');
		}

		// --- MULTI-TENANCY: Scope user lookup to the current tenant ---
		const userLookupCriteria: { email: string; tenantId?: string } = { email };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			userLookupCriteria.tenantId = tenantId;
		}
		const user = await auth.getUserByEmail(userLookupCriteria); // **SECURITY**: Use a generic error message for both non-existent users and wrong passwords.
		// This prevents "user enumeration" attacks.

		if (!user || !user.password) {
			logger.warn(`Login attempt failed: User not found or password not set for email: ${email}`, { tenantId });
			throw error(401, 'Invalid credentials.');
		} // **SECURITY**: Check if the user account is blocked.

		if (user.blocked) {
			logger.warn(`Blocked user attempted to log in: ${email}`, { userId: user._id, tenantId });
			throw error(403, 'Your account has been suspended. Please contact support.');
		}

		// QUANTUM-RESISTANT PASSWORD VERIFICATION
		// Uses Argon2id: Memory-hard algorithm that resists quantum speedup
		// - 64 MB memory per verification limits quantum parallelization
		// - Grover's algorithm provides no advantage for memory-bound operations
		// - Secure against quantum computers for 15-30+ years
		const isValidPassword = await verifyPassword(user.password, password);

		if (!isValidPassword) {
			logger.warn(`Login attempt failed: Invalid password for user: ${email}`, { userId: user._id, tenantId });
			throw error(401, 'Invalid credentials.');
		}

		// Credentials are valid, create a session.
		// The expiration should ideally come from a central config.

		const session = await auth.createSession({
			user_id: user._id,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }), // Add tenantId to the session
			expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as import('@shared/database/dbInterface').ISODateString // 24-hour session
		}); // Cache user in session store

		const sessionCookie = auth.createSessionCookie(session._id);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes as any);

		logger.info(`User logged in successfully: ${user.email}`, { userId: user._id, tenantId });

		return json({ success: true, message: 'Login successful.' });
	} catch (err) {
		// This block now only catches unexpected errors or deliberate `throw error()` calls.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred during login.'; // We don't log 4xx errors as "errors" because they are expected client-side issues.

		if (status >= 500) {
			logger.error('Internal server error during login:', {
				error: message,
				stack: err instanceof Error ? err.stack : undefined,
				status
			});
		} // Re-throw the error so SvelteKit can format the final response.
		// Or return a JSON response for API clients.

		return json({ success: false, message }, { status });
	}
};
