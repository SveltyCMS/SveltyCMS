/**
 * @file src/databases/postgresql/performance/performance-module.ts
 * @description Performance metrics module for PostgreSQL
 */

import type { DatabaseResult, PerformanceMetrics, ISODateString } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';

export class PerformanceModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	async getMetrics(): Promise<DatabaseResult<PerformanceMetrics>> {
		return this.core.notImplemented('performance.getMetrics');
	}

	async clearMetrics(): Promise<DatabaseResult<void>> {
		return this.core.notImplemented('performance.clearMetrics');
	}

	async enableProfiling(_enabled: boolean): Promise<DatabaseResult<void>> {
		return this.core.notImplemented('performance.enableProfiling');
	}

	async getSlowQueries(_limit?: number): Promise<DatabaseResult<Array<{ query: string; duration: number; timestamp: ISODateString }>>> {
		return this.core.notImplemented('performance.getSlowQueries');
	}
}
