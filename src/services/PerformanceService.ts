/**
 * @file src/services/PerformanceService.ts
 * @description Persistent metrics repository for the Self-Learning State Machine.
 *
 * Features:
 * - Save learned metrics for all services to the database.
 * - Load historical metrics from the database.
 * - Record a specific benchmark (e.g. for a setup phase).
 */

import { logger } from '@utils/logger';
import type { SystemStateStore, ServicePerformanceMetrics } from '@src/stores/system/types';

/**
 * Service to handle persistence of learned performance metrics.
 * Uses systemPreferences (scope: 'system') to store historical data.
 */
export class PerformanceService {
	private static instance: PerformanceService;
	private readonly PREFERENCE_KEY_PREFIX = 'PERF_METRICS_';

	public static getInstance(): PerformanceService {
		if (!PerformanceService.instance) {
			PerformanceService.instance = new PerformanceService();
		}
		return PerformanceService.instance;
	}

	private async getDbAdapter() {
		const { dbAdapter } = await import('@src/databases/db');
		return dbAdapter;
	}

	/**
	 * Save learned metrics for all services to the database.
	 */
	async saveMetrics(services: SystemStateStore['services']): Promise<void> {
		const dbAdapter = await this.getDbAdapter();
		if (!dbAdapter?.systemPreferences) {
			logger.warn('[PerformanceService] Cannot save metrics: dbAdapter not available');
			return;
		}

		try {
			const preferences = Object.entries(services).map(([name, status]) => ({
				key: `${this.PREFERENCE_KEY_PREFIX}${name}`,
				value: JSON.stringify(status.metrics),
				category: 'performance',
				scope: 'system' as const
			}));

			await dbAdapter.systemPreferences.setMany(preferences);
			logger.debug('[PerformanceService] Saved historical metrics to database');
		} catch (error) {
			logger.error('[PerformanceService] Failed to save metrics:', error);
		}
	}

	/**
	 * Load historical metrics from the database.
	 */
	async loadMetrics(): Promise<Record<string, ServicePerformanceMetrics>> {
		const dbAdapter = await this.getDbAdapter();
		if (!dbAdapter?.systemPreferences) {
			logger.warn('[PerformanceService] Cannot load metrics: dbAdapter not available');
			return {};
		}

		try {
			const result = await dbAdapter.systemPreferences.getByCategory('performance', 'system');

			if (!result.success || !result.data) return {};

			const metrics: Record<string, ServicePerformanceMetrics> = {};
			for (const [key, value] of Object.entries(result.data)) {
				if (key.startsWith(this.PREFERENCE_KEY_PREFIX)) {
					const name = key.replace(this.PREFERENCE_KEY_PREFIX, '');
					try {
						metrics[name] = typeof value === 'string' ? JSON.parse(value) : value;
					} catch {
						logger.warn(`[PerformanceService] Failed to parse metrics for ${name}`);
					}
				}
			}

			return metrics;
		} catch (error) {
			logger.error('[PerformanceService] Failed to load metrics:', error);
			return {};
		}
	}

	/**
	 * Record a specific benchmark (e.g. for a setup phase).
	 */
	async recordBenchmark(name: string, value: number): Promise<void> {
		const dbAdapter = await this.getDbAdapter();
		if (!dbAdapter?.systemPreferences) return;

		try {
			await dbAdapter.systemPreferences.set(
				`BENCHMARK_${name}`,
				JSON.stringify({
					value,
					timestamp: Date.now()
				}),
				'system',
				undefined,
				'benchmark'
			);
		} catch (error) {
			logger.error(`[PerformanceService] Failed to record benchmark ${name}:`, error);
		}
	}
}

export const performanceService = PerformanceService.getInstance();
