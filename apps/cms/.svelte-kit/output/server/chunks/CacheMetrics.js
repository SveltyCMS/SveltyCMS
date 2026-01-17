import { logger } from './logger.js';
import { d as dateToISODateString } from './dateUtils.js';
class CacheMetrics {
	hits = 0;
	misses = 0;
	totalResponseTime = 0;
	requestCount = 0;
	lastResetTime = dateToISODateString(/* @__PURE__ */ new Date());
	// Category-based metrics (query, schema, widget, theme, media, content)
	categoryMetrics = /* @__PURE__ */ new Map();
	// Tenant-specific metrics for multi-tenant isolation
	tenantMetrics = /* @__PURE__ */ new Map();
	// Recent events for debugging (keep last 100)
	recentEvents = [];
	MAX_EVENTS = 100;
	// Records a cache hit
	recordHit(key, category, tenantId, responseTime) {
		this.hits++;
		this.requestCount++;
		if (responseTime !== void 0) {
			this.totalResponseTime += responseTime;
		}
		const catMetrics = this.categoryMetrics.get(category) || { hits: 0, misses: 0, totalTTL: 0, ttlCount: 0 };
		catMetrics.hits++;
		this.categoryMetrics.set(category, catMetrics);
		if (tenantId) {
			const tenantMetric = this.tenantMetrics.get(tenantId) || { hits: 0, misses: 0 };
			tenantMetric.hits++;
			this.tenantMetrics.set(tenantId, tenantMetric);
		}
		this.addEvent({ type: 'hit', key, category, tenantId, responseTime, timestamp: dateToISODateString(/* @__PURE__ */ new Date()) });
	}
	// Records a cache miss
	recordMiss(key, category, tenantId, responseTime) {
		this.misses++;
		this.requestCount++;
		if (responseTime !== void 0) {
			this.totalResponseTime += responseTime;
		}
		const catMetrics = this.categoryMetrics.get(category) || { hits: 0, misses: 0, totalTTL: 0, ttlCount: 0 };
		catMetrics.misses++;
		this.categoryMetrics.set(category, catMetrics);
		if (tenantId) {
			const tenantMetric = this.tenantMetrics.get(tenantId) || { hits: 0, misses: 0 };
			tenantMetric.misses++;
			this.tenantMetrics.set(tenantId, tenantMetric);
		}
		this.addEvent({ type: 'miss', key, category, tenantId, responseTime, timestamp: dateToISODateString(/* @__PURE__ */ new Date()) });
	}
	// Records a cache set operation with TTL for average tracking
	recordSet(key, category, ttl, tenantId) {
		const catMetrics = this.categoryMetrics.get(category) || { hits: 0, misses: 0, totalTTL: 0, ttlCount: 0 };
		catMetrics.totalTTL += ttl;
		catMetrics.ttlCount++;
		this.categoryMetrics.set(category, catMetrics);
		this.addEvent({ type: 'set', key, category, tenantId, timestamp: dateToISODateString(/* @__PURE__ */ new Date()) });
	}
	// Records a cache delete operation
	recordDelete(key, category, tenantId) {
		this.addEvent({ type: 'delete', key, category, tenantId, timestamp: dateToISODateString(/* @__PURE__ */ new Date()) });
	}
	// Records a cache clear operation
	recordClear(pattern, category, tenantId) {
		this.addEvent({ type: 'clear', key: pattern, category, tenantId, timestamp: dateToISODateString(/* @__PURE__ */ new Date()) });
	}
	// Adds an event to the recent events queue
	addEvent(event) {
		this.recentEvents.push(event);
		if (this.recentEvents.length > this.MAX_EVENTS) {
			this.recentEvents.shift();
		}
	}
	// Gets current metrics snapshot
	getSnapshot() {
		const hitRate = this.requestCount > 0 ? this.hits / this.requestCount : 0;
		const avgResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;
		const byCategory = {};
		for (const [category, metrics] of this.categoryMetrics.entries()) {
			const total = metrics.hits + metrics.misses;
			byCategory[category] = {
				hits: metrics.hits,
				misses: metrics.misses,
				hitRate: total > 0 ? metrics.hits / total : 0,
				avgTTL: metrics.ttlCount > 0 ? metrics.totalTTL / metrics.ttlCount : 0
			};
		}
		const byTenant = {};
		for (const [tenantId, metrics] of this.tenantMetrics.entries()) {
			const total = metrics.hits + metrics.misses;
			byTenant[tenantId] = {
				hits: metrics.hits,
				misses: metrics.misses,
				hitRate: total > 0 ? metrics.hits / total : 0
			};
		}
		return {
			hits: this.hits,
			misses: this.misses,
			hitRate,
			totalRequests: this.requestCount,
			avgResponseTime,
			lastReset: this.lastResetTime,
			byCategory,
			byTenant: Object.keys(byTenant).length > 0 ? byTenant : void 0
		};
	}
	/**
	 * Gets recent cache events for debugging
	 */
	getRecentEvents(limit = 50) {
		return this.recentEvents.slice(-limit);
	}
	/**
	 * Resets all metrics
	 */
	reset() {
		this.hits = 0;
		this.misses = 0;
		this.totalResponseTime = 0;
		this.requestCount = 0;
		this.lastResetTime = dateToISODateString(/* @__PURE__ */ new Date());
		this.categoryMetrics.clear();
		this.tenantMetrics.clear();
		this.recentEvents = [];
		logger.info('Cache metrics reset');
	}
	// Logs current metrics summary
	logSummary() {
		const snapshot = this.getSnapshot();
		logger.info('Cache Metrics Summary', {
			hitRate: `${(snapshot.hitRate * 100).toFixed(2)}%`,
			hits: snapshot.hits,
			misses: snapshot.misses,
			totalRequests: snapshot.totalRequests,
			avgResponseTime: `${snapshot.avgResponseTime.toFixed(2)}ms`,
			categories: Object.keys(snapshot.byCategory).length,
			tenants: snapshot.byTenant ? Object.keys(snapshot.byTenant).length : 0
		});
	}
	// Exports metrics in Prometheus format for monitoring systems
	exportPrometheusFormat() {
		const snapshot = this.getSnapshot();
		const lines = [];
		lines.push('# HELP cache_hit_rate Cache hit rate (0-1)');
		lines.push('# TYPE cache_hit_rate gauge');
		lines.push(`cache_hit_rate ${snapshot.hitRate.toFixed(4)}`);
		lines.push('# HELP cache_hits_total Total cache hits');
		lines.push('# TYPE cache_hits_total counter');
		lines.push(`cache_hits_total ${snapshot.hits}`);
		lines.push('# HELP cache_misses_total Total cache misses');
		lines.push('# TYPE cache_misses_total counter');
		lines.push(`cache_misses_total ${snapshot.misses}`);
		lines.push('# HELP cache_avg_response_time_ms Average cache response time in milliseconds');
		lines.push('# TYPE cache_avg_response_time_ms gauge');
		lines.push(`cache_avg_response_time_ms ${snapshot.avgResponseTime.toFixed(2)}`);
		for (const [category, metrics] of Object.entries(snapshot.byCategory)) {
			lines.push(`# HELP cache_category_hit_rate_${category} Hit rate for ${category} category`);
			lines.push(`# TYPE cache_category_hit_rate_${category} gauge`);
			lines.push(`cache_category_hit_rate_${category} ${metrics.hitRate.toFixed(4)}`);
		}
		return lines.join('\n');
	}
}
const cacheMetrics = new CacheMetrics();
export { cacheMetrics as c };
//# sourceMappingURL=CacheMetrics.js.map
