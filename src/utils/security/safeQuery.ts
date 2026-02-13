/**
 * @file src/utils/security/safeQuery.ts
 * @description Utility to enforce strict tenant isolation in database queries.
 *
 * Prevents "Data Leakage" bugs by ensuring every query has a tenantId
 * when running in Multi-Tenant mode.
 */

import { AppError } from '@utils/errorHandling';
import { privateEnv } from '@config/private'; // Direct access or via getter

interface SafeQueryOptions {
	sudo?: boolean; // Bypass check (e.g. for System Admin queries)
}

/**
 * Validates that a query object includes a tenantId if Multi-Tenancy is enabled.
 * Throws an error if validation fails.
 *
 * @param query - The query object (e.g. Mongoose filter)
 * @param tenantId - The tenantId from the context (Event/Session)
 * @param options - Options to bypass check
 */
export function safeQuery<T extends Record<string, any>>(query: T, tenantId?: string | null, options: SafeQueryOptions = {}): T {
	// 1. Skip if Multi-Tenancy is disabled
	if (!privateEnv?.MULTI_TENANT) {
		return query;
	}

	// 2. Skip if sudo mode (System Admin)
	if (options.sudo) {
		return query;
	}

	// 3. Strict Check
	if (!tenantId) {
		throw new AppError('Security Violation: Attempted to execute query without tenant context in Multi-Tenant mode.', 500, 'TENANT_CONTEXT_MISSING');
	}

	// 4. Force inject tenantId into query (Mutation or new object)
	// We return a new object to be safe
	return {
		...query,
		tenantId
	};
}
