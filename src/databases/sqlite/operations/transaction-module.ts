/**
 * @file src/databases/mariadb/operations/transaction-module.ts
 * @description Transaction module for MariaDB
 *
 * Features:
 * - Execute transaction
 */

import type { DatabaseResult, DatabaseTransaction } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';
import * as utils from '../utils';

export class TransactionModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db;
	}

	async execute<T>(
		fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
		options?: {
			isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
		}
	): Promise<DatabaseResult<T>> {
		if (!this.db) {
			return this.core.notConnectedError();
		}

		try {
			return await this.db.transaction(async (_tx) => {
				const dbTransaction: DatabaseTransaction = {
					commit: async () => ({ success: true, data: undefined }),
					rollback: async () => {
						throw new Error('ROLLBACK_TRANSACTION');
					}
				};

				const result = await fn(dbTransaction);
				if (!result.success) {
					throw new Error(result.message || 'Transaction failed');
				}
				return result;
			}, options as any);
		} catch (error) {
			if ((error as Error).message === 'ROLLBACK_TRANSACTION') {
				return {
					success: false,
					message: 'Transaction rolled back',
					error: utils.createDatabaseError('TRANSACTION_ROLLED_BACK', 'Transaction rolled back')
				};
			}
			return this.core.handleError(error, 'TRANSACTION_FAILED');
		}
	}
}
