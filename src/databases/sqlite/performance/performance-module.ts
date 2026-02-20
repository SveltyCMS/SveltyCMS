/**
 * @file src/databases/mariadb/performance/performance-module.ts
 * @description Performance metrics module for MariaDB
 *
 * Features:
 * - Get metrics
 * - Clear metrics
 * - Enable profiling
 * - Get slow queries
 */

import type { DatabaseResult, PerformanceMetrics } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';

export class PerformanceModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	async getMetrics(_tags?: string[]): Promise<DatabaseResult<PerformanceMetrics>> {
		return this.core.notImplemented('performance.getMetrics');
	}

	async clearMetrics(_tags?: string[]): Promise<DatabaseResult<void>> {
		return this.core.notImplemented('performance.clearMetrics');
	}

	async enableProfiling(_enabled: boolean): Promise<DatabaseResult<void>> {
		return this.core.notImplemented('performance.enableProfiling');
	}

	async getSlowQueries(_limit?: number): Promise<DatabaseResult<Array<{ query: string; duration: number; timestamp: import('../../db-interface').ISODateString }>>> {
		return this.core.notImplemented('performance.getSlowQueries');
	}
}
