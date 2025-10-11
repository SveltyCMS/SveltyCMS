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

import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, type Handle } from '@sveltejs/kit';

import { getTenantIdFromHostname } from './utils/tenant';

// System Logger
import { logger } from '@utils/logger.svelte';

// Identifies a tenant based on the request hostname.
export const handleMultiTenancy: Handle = async ({ event, resolve }) => {
	if (event.locals.__skipSystemHooks) {
		return resolve(event);
	}
	if (getPrivateSettingSync('MULTI_TENANT')) {
		const tenantId = getTenantIdFromHostname(event.url.hostname);
		if (!tenantId) {
			throw error(404, `Tenant not found for hostname: ${event.url.hostname}`);
		}
		event.locals.tenantId = tenantId;
		logger.trace(`Request identified for tenant: ${tenantId}`);
	}
	return resolve(event);
};
