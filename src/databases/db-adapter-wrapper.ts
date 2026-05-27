/**
 * @file src/databases/db-adapter-wrapper.ts
 * @description Central wrapper to enforce strict tenant isolation across database calls.
 */

import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export async function withTenant<T>(
	tenantId: string | null | undefined,
	operation: () => Promise<T>,
	options: { allowGlobal?: boolean; collection?: string } = {}
): Promise<T> {
	if (tenantId) {
		return operation(); // In future: auto-inject { tenantId } into queries
	}

	if (options.allowGlobal) {
		logger.debug(`Global/system context allowed for ${options.collection || 'unknown'}`);
		return operation();
	}

	throw new AppError(`Tenant context required for this operation (collection: ${options.collection || 'unknown'})`, 403, 'TENANT_REQUIRED');
}
