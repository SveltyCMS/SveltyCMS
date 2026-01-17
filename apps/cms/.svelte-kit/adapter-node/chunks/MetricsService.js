import { logger } from './logger.js';
import { b as building } from './environment.js';
class MetricsCounters {
	// Request metrics
	requests = { total: 0, errors: 0, totalResponseTime: 0 };
	// Authentication metrics
	auth = {
		validations: 0,
		failures: 0,
		cacheHits: 0,
		cacheMisses: 0
	};
	// API metrics
	api = {
		requests: 0,
		errors: 0,
		cacheHits: 0,
		cacheMisses: 0
	};
	// Security metrics
	security = {
		rateLimitViolations: 0,
		cspViolations: 0,
		authFailures: 0
	};
	// Performance metrics
	performance = {
		slowRequests: 0,
		totalHookTime: 0,
		hookExecutions: 0,
		bottlenecks: /* @__PURE__ */ new Map()
	};
	// Metadata
	lastReset = Date.now();
	startTime = Date.now();
}
class MetricsService {
	counters = new MetricsCounters();
	resetInterval = null;
	constructor() {
		if (!building) {
			this.resetInterval = setInterval(
				() => {
					this.reset();
				},
				60 * 60 * 1e3
			);
		}
	}
	// --- REQUEST METRICS ---
	/**
	 * Increment total request counter.
	 * Call this at the start of request processing.
	 */
	incrementRequests() {
		this.counters.requests.total++;
	}
	/**
	 * Increment error counter.
	 * Call this when a request results in an error.
	 */
	incrementErrors() {
		this.counters.requests.errors++;
	}
	/**
	 * Record response time for performance analysis.
	 * @param timeMs - Response time in milliseconds
	 */
	recordResponseTime(timeMs) {
		this.counters.requests.totalResponseTime += timeMs;
		if (timeMs > 2e3) {
			this.counters.performance.slowRequests++;
		}
	}
	// --- AUTHENTICATION METRICS ---
	/**
	 * Increment authentication validation counter.
	 * Call this for each session validation attempt.
	 */
	incrementAuthValidations() {
		this.counters.auth.validations++;
	}
	/**
	 * Increment authentication failure counter.
	 * Call this when session validation fails.
	 */
	incrementAuthFailures() {
		this.counters.auth.failures++;
		this.counters.security.authFailures++;
	}
	/**
	 * Record authentication cache hit.
	 * Call this when session is found in cache.
	 */
	recordAuthCacheHit() {
		this.counters.auth.cacheHits++;
	}
	/**
	 * Record authentication cache miss.
	 * Call this when session must be fetched from database.
	 */
	recordAuthCacheMiss() {
		this.counters.auth.cacheMisses++;
	}
	// --- API METRICS ---
	/**
	 * Increment API request counter.
	 * Call this for each API request processed.
	 */
	incrementApiRequests() {
		this.counters.api.requests++;
	}
	/**
	 * Increment API error counter.
	 * Call this when an API request fails.
	 */
	incrementApiErrors() {
		this.counters.api.errors++;
	}
	/**
	 * Record API cache hit.
	 * Call this when API response is served from cache.
	 */
	recordApiCacheHit() {
		this.counters.api.cacheHits++;
	}
	/**
	 * Record API cache miss.
	 * Call this when API response must be generated.
	 */
	recordApiCacheMiss() {
		this.counters.api.cacheMisses++;
	}
	// --- SECURITY METRICS ---
	/**
	 * Increment rate limit violation counter.
	 * Call this when a request is rate limited.
	 */
	incrementRateLimitViolations() {
		this.counters.security.rateLimitViolations++;
	}
	/**
	 * Increment CSP violation counter.
	 * Call this when a CSP violation is detected.
	 */
	incrementCSPViolations() {
		this.counters.security.cspViolations++;
	}
	/**
	 * Increment security violations counter.
	 */
	incrementSecurityViolations() {
		this.counters.security.cspViolations++;
	}
	// --- PERFORMANCE METRICS ---
	/**
	 * Record hook execution time for performance analysis.
	 * @param hookName - Name of the hook
	 * @param timeMs - Execution time in milliseconds
	 */
	recordHookExecutionTime(hookName, timeMs) {
		this.counters.performance.totalHookTime += timeMs;
		this.counters.performance.hookExecutions++;
		if (timeMs > 100) {
			const current = this.counters.performance.bottlenecks.get(hookName) || 0;
			this.counters.performance.bottlenecks.set(hookName, current + 1);
		}
	}
	// --- REPORTING ---
	// Generate a comprehensive metrics report
	getReport() {
		const now = Date.now();
		const uptime = now - this.counters.startTime;
		const safeRate = (numerator, denominator) => (denominator > 0 ? (numerator / denominator) * 100 : 0);
		const avgResponseTime = this.counters.requests.total > 0 ? this.counters.requests.totalResponseTime / this.counters.requests.total : 0;
		const avgHookTime =
			this.counters.performance.hookExecutions > 0 ? this.counters.performance.totalHookTime / this.counters.performance.hookExecutions : 0;
		const bottlenecks = Array.from(this.counters.performance.bottlenecks.entries())
			.sort(([, a], [, b]) => b - a)
			.slice(0, 5)
			.map(([name]) => name);
		return {
			timestamp: now,
			uptime,
			requests: {
				total: this.counters.requests.total,
				errors: this.counters.requests.errors,
				errorRate: safeRate(this.counters.requests.errors, this.counters.requests.total),
				avgResponseTime
			},
			authentication: {
				validations: this.counters.auth.validations,
				failures: this.counters.auth.failures,
				successRate: safeRate(this.counters.auth.validations - this.counters.auth.failures, this.counters.auth.validations),
				cacheHits: this.counters.auth.cacheHits,
				cacheMisses: this.counters.auth.cacheMisses,
				cacheHitRate: safeRate(this.counters.auth.cacheHits, this.counters.auth.cacheHits + this.counters.auth.cacheMisses)
			},
			api: {
				requests: this.counters.api.requests,
				errors: this.counters.api.errors,
				cacheHits: this.counters.api.cacheHits,
				cacheMisses: this.counters.api.cacheMisses,
				cacheHitRate: safeRate(this.counters.api.cacheHits, this.counters.api.cacheHits + this.counters.api.cacheMisses)
			},
			security: {
				rateLimitViolations: this.counters.security.rateLimitViolations,
				cspViolations: this.counters.security.cspViolations,
				authFailures: this.counters.security.authFailures
			},
			performance: {
				slowRequests: this.counters.performance.slowRequests,
				avgHookExecutionTime: avgHookTime,
				bottlenecks
			}
		};
	}
	// Reset all metrics counters periodically to prevent memory growth
	reset() {
		this.counters = new MetricsCounters();
		logger.trace('Unified metrics reset');
	}
	// Export metrics in Prometheus format for monitoring systems
	exportPrometheus() {
		const report = this.getReport();
		const lines = [];
		lines.push(`# HELP svelty_requests_total Total number of requests`);
		lines.push(`# TYPE svelty_requests_total counter`);
		lines.push(`svelty_requests_total ${report.requests.total}`);
		lines.push(`# HELP svelty_requests_errors_total Total number of request errors`);
		lines.push(`# TYPE svelty_requests_errors_total counter`);
		lines.push(`svelty_requests_errors_total ${report.requests.errors}`);
		lines.push(`# HELP svelty_auth_cache_hit_rate Authentication cache hit rate`);
		lines.push(`# TYPE svelty_auth_cache_hit_rate gauge`);
		lines.push(`svelty_auth_cache_hit_rate ${report.authentication.cacheHitRate / 100}`);
		lines.push(`# HELP svelty_api_cache_hit_rate API cache hit rate`);
		lines.push(`# TYPE svelty_api_cache_hit_rate gauge`);
		lines.push(`svelty_api_cache_hit_rate ${report.api.cacheHitRate / 100}`);
		lines.push(`# HELP svelty_security_violations_total Total security violations`);
		lines.push(`# TYPE svelty_security_violations_total counter`);
		lines.push(`svelty_security_violations_total{type="rate_limit"} ${report.security.rateLimitViolations}`);
		lines.push(`svelty_security_violations_total{type="csp"} ${report.security.cspViolations}`);
		return lines.join('\n') + '\n';
	}
	// Cleanup resources when shutting down
	destroy() {
		if (this.resetInterval) {
			clearInterval(this.resetInterval);
			this.resetInterval = null;
		}
	}
}
const metricsService = new MetricsService();
const cleanupMetrics = () => {
	metricsService.destroy();
};
if (!building && typeof process !== 'undefined' && typeof window === 'undefined') {
	process.on('SIGTERM', cleanupMetrics);
	process.on('SIGINT', cleanupMetrics);
}
export { metricsService as m };
//# sourceMappingURL=MetricsService.js.map
