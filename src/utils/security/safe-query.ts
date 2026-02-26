/**
 * @file src/utils/security/safeQuery.ts
 * @description Utility to enforce strict tenant isolation in database queries.
 *
 * Prevents "Data Leakage" bugs by ensuring every query has a tenantId
 * when running in Multi-Tenant mode.
 */

import { getPrivateEnv } from '@src/databases/config-state';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger';

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
	// 1. Get private config
	const privateEnv = getPrivateEnv();
	logger.trace(`[SafeQuery] Incoming Query: ${JSON.stringify(query)} TenantId: ${tenantId} MultiTenant: ${privateEnv?.MULTI_TENANT}`);

	// 2. Skip if Multi-Tenancy is disabled
	if (!privateEnv?.MULTI_TENANT) {
		return query;
	}

	// 3. Skip if sudo mode (System Admin)
	if (options.sudo) {
		return query;
	}

	// 4. Strict Check
	if (!tenantId) {
		throw new AppError('Security Violation: Attempted to execute query without tenant context in Multi-Tenant mode.', 500, 'TENANT_CONTEXT_MISSING');
	}

	// 5. Force inject tenantId into query (Mutation or new object)
	// We return a new object to be safe
	return {
		...query,
		tenantId
	};
}
