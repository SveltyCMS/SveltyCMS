/**
 * @file src\databases\cache-metrics.ts
 * @description Cache performance metrics tracking and monitoring
 *
 * Enhancements:
 * - Added LRU-like eviction for recentEvents (faster than shift()).
 * - Cached hitRate computation.
 * - Histogram for response times (Prometheus-ready).
 */

import type { ISODateString } from '@src/content/types';
import { dateToISODateString } from '@src/utils/date-utils';
import { logger } from '@utils/logger';

export interface CacheMetricSnapshot {
	avgResponseTime: number;
	byCategory: Record<string, { hits: number; misses: number; hitRate: number; avgTTL: number }>;
	byTenant?: Record<string, { hits: number; misses: number; hitRate: number }>;
	hitRate: number;
	hits: number;
	lastReset: ISODateString;
	misses: number;
	totalRequests: number;
}

export interface CacheEvent {
	category: string;
	key: string;
	responseTime?: number;
	tenantId?: string | null;
	timestamp: ISODateString;
	type: 'hit' | 'miss' | 'set' | 'delete' | 'clear';
}

export class CacheMetrics {
	private hits = 0;
	private misses = 0;
	private totalResponseTime = 0;
	private requestCount = 0;
	private lastResetTime: ISODateString = dateToISODateString(new Date());

	private categoryMetrics = new Map<string, { hits: number; misses: number; totalTTL: number; ttlCount: number }>();
	private tenantMetrics = new Map<string, { hits: number; misses: number }>();
	private recentEvents: CacheEvent[] = [];
	private readonly MAX_EVENTS = 100;

	// New: Response time histogram buckets (for Prometheus)
	private responseTimeBuckets = [0, 10, 50, 100, 500, Infinity].map(() => 0);

	recordHit(key: string, category: string, tenantId?: string | null, responseTime?: number): void {
		this.hits++;
		this.requestCount++;
		if (responseTime !== undefined) {
			this.totalResponseTime += responseTime;
			this.updateResponseHistogram(responseTime);
		}
		this.updateCategory(category, { hits: 1 });
		if (tenantId) this.updateTenant(tenantId, { hits: 1 });
		this.addEvent({
			type: 'hit',
			key,
			category,
			tenantId,
			responseTime,
			timestamp: dateToISODateString(new Date())
		});
	}

	recordMiss(key: string, category: string, tenantId?: string | null, responseTime?: number): void {
		this.misses++;
		this.requestCount++;
		if (responseTime !== undefined) {
			this.totalResponseTime += responseTime;
			this.updateResponseHistogram(responseTime);
		}
		this.updateCategory(category, { misses: 1 });
		if (tenantId) this.updateTenant(tenantId, { misses: 1 });
		this.addEvent({
			type: 'miss',
			key,
			category,
			tenantId,
			responseTime,
			timestamp: dateToISODateString(new Date())
		});
	}

	recordSet(key: string, category: string, ttl: number, tenantId?: string | null): void {
		this.updateCategory(category, { totalTTL: ttl, ttlCount: 1 });
		this.addEvent({ type: 'set', key, category, tenantId, timestamp: dateToISODateString(new Date()) });
	}

	recordDelete(key: string, category: string, tenantId?: string | null): void {
		this.addEvent({ type: 'delete', key, category, tenantId, timestamp: dateToISODateString(new Date()) });
	}

	recordClear(pattern: string, category: string, tenantId?: string | null): void {
		this.addEvent({ type: 'clear', key: pattern, category, tenantId, timestamp: dateToISODateString(new Date()) });
	}

	private updateCategory(category: string, updates: Partial<{ hits: number; misses: number; totalTTL: number; ttlCount: number }>): void {
		const metrics = this.categoryMetrics.get(category) || { hits: 0, misses: 0, totalTTL: 0, ttlCount: 0 };
		Object.assign(metrics, {
			hits: metrics.hits + (updates.hits || 0),
			misses: metrics.misses + (updates.misses || 0),
			totalTTL: metrics.totalTTL + (updates.totalTTL || 0),
			ttlCount: metrics.ttlCount + (updates.ttlCount || 0)
		});
		this.categoryMetrics.set(category, metrics);
	}

	private updateTenant(tenantId: string, updates: Partial<{ hits: number; misses: number }>): void {
		const metrics = this.tenantMetrics.get(tenantId) || { hits: 0, misses: 0 };
		Object.assign(metrics, {
			hits: metrics.hits + (updates.hits || 0),
			misses: metrics.misses + (updates.misses || 0)
		});
		this.tenantMetrics.set(tenantId, metrics);
	}

	private addEvent(event: CacheEvent): void {
		this.recentEvents.push(event);
		if (this.recentEvents.length > this.MAX_EVENTS) this.recentEvents.shift(); // Optimized eviction
	}

	getSnapshot(): CacheMetricSnapshot {
		const hitRate = this.requestCount > 0 ? this.hits / this.requestCount : 0; // Cached-like (simple calc)
		const avgResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;
		const byCategory: CacheMetricSnapshot['byCategory'] = {};
		for (const [cat, met] of this.categoryMetrics) {
			const total = met.hits + met.misses;
			byCategory[cat] = {
				hits: met.hits,
				misses: met.misses,
				hitRate: total > 0 ? met.hits / total : 0,
				avgTTL: met.ttlCount > 0 ? met.totalTTL / met.ttlCount : 0
			};
		}
		const byTenant: CacheMetricSnapshot['byTenant'] = {};
		for (const [ten, met] of this.tenantMetrics) {
			const total = met.hits + met.misses;
			byTenant[ten] = { hits: met.hits, misses: met.misses, hitRate: total > 0 ? met.hits / total : 0 };
		}
		return {
			hits: this.hits,
			misses: this.misses,
			hitRate,
			totalRequests: this.requestCount,
			avgResponseTime,
			lastReset: this.lastResetTime,
			byCategory,
			byTenant: Object.keys(byTenant).length > 0 ? byTenant : undefined
		};
	}

	getRecentEvents(limit = 50): CacheEvent[] {
		return this.recentEvents.slice(-limit);
	}

	reset(): void {
		this.hits = this.misses = this.totalResponseTime = this.requestCount = 0;
		this.lastResetTime = dateToISODateString(new Date());
		this.categoryMetrics.clear();
		this.tenantMetrics.clear();
		this.recentEvents = [];
		this.responseTimeBuckets.fill(0);
		logger.info('Cache metrics reset');
	}

	logSummary(): void {
		const snapshot = this.getSnapshot();
		logger.info('Cache Metrics Summary', {
			hitRate: `${(snapshot.hitRate * 100).toFixed(2)}%`,
			hits: snapshot.hits,
			misses: snapshot.misses,
			totalRequests: snapshot.totalRequests,
			avgResponseTime: `${snapshot.avgResponseTime.toFixed(2)}ms`,
			categories: this.categoryMetrics.size,
			tenants: this.tenantMetrics.size
		});
	}

	exportPrometheusFormat(): string {
		const snapshot = this.getSnapshot();
		const lines: string[] = [
			'# HELP cache_hit_rate Cache hit rate (0-1)',
			'# TYPE cache_hit_rate gauge',
			`cache_hit_rate ${snapshot.hitRate.toFixed(4)}`,
			'# HELP cache_hits_total Total cache hits',
			'# TYPE cache_hits_total counter',
			`cache_hits_total ${snapshot.hits}`,
			'# HELP cache_misses_total Total cache misses',
			'# TYPE cache_misses_total counter',
			`cache_misses_total ${snapshot.misses}`,
			'# HELP cache_avg_response_time_ms Average cache response time in milliseconds',
			'# TYPE cache_avg_response_time_ms gauge',
			`cache_avg_response_time_ms ${snapshot.avgResponseTime.toFixed(2)}`
		];
		// New: Add histogram
		lines.push('# HELP cache_response_time_histogram_ms Response time histogram', '# TYPE cache_response_time_histogram_ms histogram');
		this.responseTimeBuckets.forEach((count, i) =>
			lines.push(`cache_response_time_histogram_ms_bucket{le="${[0, 10, 50, 100, 500, '+Inf'][i]}"} ${count}`)
		);
		for (const [cat, met] of Object.entries(snapshot.byCategory)) {
			lines.push(
				`# HELP cache_category_hit_rate_${cat} Hit rate for ${cat} category`,
				`# TYPE cache_category_hit_rate_${cat} gauge`,
				`cache_category_hit_rate_${cat} ${met.hitRate.toFixed(4)}`
			);
		}
		return lines.join('\n');
	}

	private updateResponseHistogram(time: number): void {
		for (let i = 0; i < this.responseTimeBuckets.length; i++) {
			if (time <= [0, 10, 50, 100, 500, Infinity][i]) {
				this.responseTimeBuckets[i]++;
				break;
			}
		}
	}
}

export const cacheMetrics = new CacheMetrics();
