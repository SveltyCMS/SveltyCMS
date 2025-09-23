/**
 * @file src/hooks/utils/tenant.ts
 * @description Shared tenant utilities for multi-tenant support
 */

import { privateEnv } from '@src/stores/globalSettings';

export const getTenantIdFromHostname = (hostname: string): string | null => {
	if (!privateEnv.MULTI_TENANT) return null;
	if (hostname === 'localhost' || hostname.startsWith('127.0.0.1')) {
		return 'default';
	}
	const parts = hostname.split('.');
	if (parts.length > 2 && !['www', 'app', 'api'].includes(parts[0])) {
		return parts[0];
	}
	return null;
};
