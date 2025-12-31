// tests/bun/mocks/cacheService.ts
// Mock implementation of CacheService for Bun tests

export class MockCacheService {
	private cache = new Map<string, { value: unknown; expiresAt: number }>();
	public isInitialized = false;

	async initialize(): Promise<void> {
		this.isInitialized = true;
		console.log('[MOCK] CacheService initialized');
	}

	async get<T>(key: string): Promise<T | null> {
		const item = this.cache.get(key);
		if (!item) return null;
		if (item.expiresAt < Date.now()) {
			this.cache.delete(key);
			return null;
		}
		return item.value as T;
	}

	async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		const expiresAt = Date.now() + ttlSeconds * 1000;
		this.cache.set(key, { value, expiresAt });
	}

	async delete(key: string | string[]): Promise<void> {
		const keys = Array.isArray(key) ? key : [key];
		keys.forEach((k) => this.cache.delete(k));
	}

	async clearByPattern(pattern: string): Promise<void> {
		const regex = new RegExp(pattern.replace(/\*/g, '.*'));
		for (const key of this.cache.keys()) {
			if (regex.test(key)) this.cache.delete(key);
		}
	}

	async disconnect(): Promise<void> {
		this.cache.clear();
		this.isInitialized = false;
	}

	// Test helper methods
	getCache() {
		return this.cache;
	}

	clearAll() {
		this.cache.clear();
	}
}

export class MockCacheMetrics {
	private metrics = {
		hits: 0,
		misses: 0,
		sets: 0,
		deletes: 0,
		errors: 0,
		byCategory: new Map<string, { hits: number; misses: number }>(),
		byTenant: new Map<string, { hits: number; misses: number }>()
	};

	recordHit(category?: string, tenantId?: string): void {
		this.metrics.hits++;
		if (category) {
			const cat = this.metrics.byCategory.get(category) || { hits: 0, misses: 0 };
			cat.hits++;
			this.metrics.byCategory.set(category, cat);
		}
		if (tenantId) {
			const tenant = this.metrics.byTenant.get(tenantId) || { hits: 0, misses: 0 };
			tenant.hits++;
			this.metrics.byTenant.set(tenantId, tenant);
		}
	}

	recordMiss(category?: string, tenantId?: string): void {
		this.metrics.misses++;
		if (category) {
			const cat = this.metrics.byCategory.get(category) || { hits: 0, misses: 0 };
			cat.misses++;
			this.metrics.byCategory.set(category, cat);
		}
		if (tenantId) {
			const tenant = this.metrics.byTenant.get(tenantId) || { hits: 0, misses: 0 };
			tenant.misses++;
			this.metrics.byTenant.set(tenantId, tenant);
		}
	}

	recordSet(): void {
		this.metrics.sets++;
	}

	recordDelete(): void {
		this.metrics.deletes++;
	}

	recordError(): void {
		this.metrics.errors++;
	}

	getMetrics() {
		return {
			overall: {
				hits: this.metrics.hits,
				misses: this.metrics.misses,
				sets: this.metrics.sets,
				deletes: this.metrics.deletes,
				errors: this.metrics.errors,
				hitRate: this.metrics.hits + this.metrics.misses > 0 ? this.metrics.hits / (this.metrics.hits + this.metrics.misses) : 0
			},
			byCategory: Object.fromEntries(
				Array.from(this.metrics.byCategory.entries()).map(([cat, stats]) => [
					cat,
					{
						...stats,
						hitRate: stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0
					}
				])
			),
			byTenant: Object.fromEntries(
				Array.from(this.metrics.byTenant.entries()).map(([tid, stats]) => [
					tid,
					{
						...stats,
						hitRate: stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0
					}
				])
			)
		};
	}

	getPrometheusMetrics(): string {
		const overall = this.getMetrics().overall;
		return `# HELP cache_hits_total Total cache hits
# TYPE cache_hits_total counter
cache_hits_total ${overall.hits}

# HELP cache_misses_total Total cache misses
# TYPE cache_misses_total counter
cache_misses_total ${overall.misses}

# HELP cache_hit_rate Cache hit rate
# TYPE cache_hit_rate gauge
cache_hit_rate ${overall.hitRate}`;
	}

	reset(): void {
		this.metrics = {
			hits: 0,
			misses: 0,
			sets: 0,
			deletes: 0,
			errors: 0,
			byCategory: new Map(),
			byTenant: new Map()
		};
	}
}

// Export singleton instances for tests
export const mockCacheService = new MockCacheService();
// import { describe, it, expect } from 'bun:test';
export const mockCacheMetrics = new MockCacheMetrics();
