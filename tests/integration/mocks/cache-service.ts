/**
 * @file tests/integration/mocks/cacheService.ts
 * @description Mock cache service for integration tests.
 */

class MockCacheMetrics {
	private metrics = {
		hits: 0,
		misses: 0,
		sets: 0,
		deletes: 0,
		errors: 0,
		byCategory: {} as Record<string, { hits: number; misses: number }>,
		byTenant: {} as Record<string, { hits: number; misses: number }>
	};

	reset() {
		this.metrics = {
			hits: 0,
			misses: 0,
			sets: 0,
			deletes: 0,
			errors: 0,
			byCategory: {},
			byTenant: {}
		};
	}

	recordHit(category?: string, tenant?: string) {
		this.metrics.hits++;
		if (category) {
			if (!this.metrics.byCategory[category]) {
				this.metrics.byCategory[category] = { hits: 0, misses: 0 };
			}
			this.metrics.byCategory[category].hits++;
		}
		if (tenant) {
			if (!this.metrics.byTenant[tenant]) {
				this.metrics.byTenant[tenant] = { hits: 0, misses: 0 };
			}
			this.metrics.byTenant[tenant].hits++;
		}
	}

	recordMiss(category?: string, tenant?: string) {
		this.metrics.misses++;
		if (category) {
			if (!this.metrics.byCategory[category]) {
				this.metrics.byCategory[category] = { hits: 0, misses: 0 };
			}
			this.metrics.byCategory[category].misses++;
		}
		if (tenant) {
			if (!this.metrics.byTenant[tenant]) {
				this.metrics.byTenant[tenant] = { hits: 0, misses: 0 };
			}
			this.metrics.byTenant[tenant].misses++;
		}
	}

	recordSet() {
		this.metrics.sets++;
	}

	recordDelete() {
		this.metrics.deletes++;
	}

	recordError() {
		this.metrics.errors++;
	}

	getMetrics() {
		const calculateHitRate = (hits: number, misses: number) => {
			const total = hits + misses;
			return total === 0 ? 0 : hits / total;
		};

		const byCategory = {} as Record<string, any>;
		for (const [key, val] of Object.entries(this.metrics.byCategory)) {
			byCategory[key] = {
				...val,
				hitRate: calculateHitRate(val.hits, val.misses)
			};
		}

		const byTenant = {} as Record<string, any>;
		for (const [key, val] of Object.entries(this.metrics.byTenant)) {
			byTenant[key] = {
				...val,
				hitRate: calculateHitRate(val.hits, val.misses)
			};
		}

		return {
			overall: {
				hits: this.metrics.hits,
				misses: this.metrics.misses,
				sets: this.metrics.sets,
				deletes: this.metrics.deletes,
				errors: this.metrics.errors,
				hitRate: calculateHitRate(this.metrics.hits, this.metrics.misses)
			},
			byCategory,
			byTenant
		};
	}

	getPrometheusMetrics() {
		const metrics = this.getMetrics();
		return `
# HELP cache_hits_total Total number of cache hits
# TYPE cache_hits_total counter
cache_hits_total ${metrics.overall.hits}

# HELP cache_misses_total Total number of cache misses
# TYPE cache_misses_total counter
cache_misses_total ${metrics.overall.misses}

# HELP cache_hit_rate Cache hit rate
# TYPE cache_hit_rate gauge
cache_hit_rate ${metrics.overall.hitRate}
        `;
	}
}

class MockCacheService {
	private readonly cache = new Map<string, { value: any; expires: number }>();

	async initialize() {
		this.cache.clear();
	}

	async get(key: string) {
		const entry = this.cache.get(key);
		if (!entry) {
			return null;
		}
		if (Date.now() > entry.expires) {
			this.cache.delete(key);
			return null;
		}
		return entry.value;
	}

	async set(key: string, value: any, ttlSeconds: number) {
		this.cache.set(key, {
			value,
			expires: Date.now() + ttlSeconds * 1000
		});
		return true;
	}

	async delete(key: string) {
		return this.cache.delete(key);
	}

	async has(key: string) {
		return this.get(key) !== null;
	}

	async clear() {
		this.cache.clear();
	}

	async clearAll() {
		this.cache.clear();
	}

	async keys() {
		return Array.from(this.cache.keys());
	}

	async clearByPattern(pattern: string) {
		// Simple regex conversion for globs using *
		const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				this.cache.delete(key);
			}
		}
	}

	getStats() {
		return {
			hits: 0,
			misses: 0,
			sets: this.cache.size,
			deletes: 0,
			size: this.cache.size
		};
	}
}

export const mockCacheMetrics = new MockCacheMetrics();
export const mockCacheService = new MockCacheService();
