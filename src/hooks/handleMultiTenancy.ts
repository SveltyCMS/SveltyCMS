/**
 * @file src/hooks/handleMultiTenancy.ts
 * @description Handles multi-tenant identification and context setup
 *
 * Features:
 * - Hostname-based tenant identification
 * - Subdomain parsing for tenant extraction
 * - Default tenant support for development
 * - Early tenant validation and error handling
 * - Efficient tenant ID extraction from request context
 */

import { privateEnv } from '@root/config/private';
import { error, type Handle } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';

/**
 * Identifies a tenant based on the request hostname.
 * In a real-world application, this would query a database of tenants.
 * This placeholder assumes a subdomain-based tenancy model (e.g., `my-tenant.example.com`).
 * @param hostname The hostname from the request URL.
 * @returns The tenant ID or null if not a tenant-specific domain.
 */
const getTenantIdFromHostname = (hostname: string): string | null => {
	if (hostname === 'localhost' || hostname.startsWith('127.0.0.1')) {
		return 'default'; // A default tenant for local development
	}
	const parts = hostname.split('.');
	// Assuming a structure like `tenant-name.your-domain.com`
	if (parts.length > 2 && !['www', 'app', 'api'].includes(parts[0])) {
		return parts[0];
	}
	// This could return a default tenant ID for the main domain if desired
	return null;
};

export const handleMultiTenancy: Handle = async ({ event, resolve }) => {
	if (privateEnv.MULTI_TENANT) {
		const tenantId = getTenantIdFromHostname(event.url.hostname);
		if (!tenantId) {
			throw error(404, `Tenant not found for hostname: ${event.url.hostname}`);
		}
		event.locals.tenantId = tenantId;
		logger.debug(`Request identified for tenant: ${tenantId}`);
	}
	return resolve(event);
};
