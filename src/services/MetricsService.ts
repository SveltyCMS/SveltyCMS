/**
 * @file src/services/MetricsService.ts
 * @description Unified metrics service for all middleware hooks
 *
 * ### Features
 * - Centralized metrics collection for all hooks
 * - High-performance counters with minimal overhead
 * - Automatic metric aggregation and reporting
 * - Thread-safe operations with atomic updates
 * - Memory-efficient with automatic cleanup
 * - Prometheus-style metrics export
 *
 * ### Categories
 * - **Requests**: Total requests, errors, response times
 * - **Auth**: Session validations, failures, cache hits/misses
 * - **API**: API requests, cache performance, rate limiting
 * - **Performance**: Hook execution times, bottlenecks
 * - **Security**: CSP violations, rate limit violations, auth failures
 *
 * @enterprise Optimized for high-throughput production environments
 */

import { logger } from '@utils/logger.server';
import { building } from '$app/environment';

// --- TYPES ---

export interface MetricSnapshot {
	name: string;
	value: number;
	timestamp: number;
	category: string;
	labels?: Record<string, string>;
}

export interface MetricsReport {
	timestamp: number;
	uptime: number;
	requests: {
		total: number;
		errors: number;
		errorRate: number;
		avgResponseTime: number;
	};
	authentication: {
		validations: number;
		failures: number;
		successRate: number;
		cacheHits: number;
		cacheMisses: number;
		cacheHitRate: number;
	};
	api: {
		requests: number;
		errors: number;
		cacheHits: number;
		cacheMisses: number;
		cacheHitRate: number;
	};
	security: {
		rateLimitViolations: number;
		cspViolations: number;
		authFailures: number;
	};
	performance: {
		slowRequests: number;
		avgHookExecutionTime: number;
		bottlenecks: string[];
	};
}

// --- METRICS COUNTERS ---

/**
 * High-performance atomic counters for metrics collection.
 * Using simple objects for maximum performance in V8.
 */
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
		bottlenecks: new Map<string, number>()
	};

	// Metadata
	lastReset = Date.now();
	startTime = Date.now();
}

// --- METRICS SERVICE ---

/**
 * Singleton metrics service for enterprise-grade performance monitoring.
 * Thread-safe and optimized for minimal overhead.
 */
class MetricsService {
	private counters = new MetricsCounters();
	private resetInterval: NodeJS.Timeout | null = null;

	constructor() {
		// Auto-reset metrics every hour to prevent memory growth
		if (!building) {
			this.resetInterval = setInterval(
				() => {
					this.reset();
				},
				60 * 60 * 1000
			);
		}
	}

	// --- REQUEST METRICS ---

	/**
	 * Increment total request counter.
	 * Call this at the start of request processing.
	 */
	incrementRequests(): void {
		this.counters.requests.total++;
	}

	/**
	 * Increment error counter.
	 * Call this when a request results in an error.
	 */
	incrementErrors(): void {
		this.counters.requests.errors++;
	}

	/**
	 * Record response time for performance analysis.
	 * @param timeMs - Response time in milliseconds
	 */
	recordResponseTime(timeMs: number): void {
		this.counters.requests.totalResponseTime += timeMs;

		// Track slow requests (>2 seconds)
		if (timeMs > 2000) {
			this.counters.performance.slowRequests++;
		}
	}

	// --- AUTHENTICATION METRICS ---

	/**
	 * Increment authentication validation counter.
	 * Call this for each session validation attempt.
	 */
	incrementAuthValidations(): void {
		this.counters.auth.validations++;
	}

	/**
	 * Increment authentication failure counter.
	 * Call this when session validation fails.
	 */
	incrementAuthFailures(): void {
		this.counters.auth.failures++;
		this.counters.security.authFailures++;
	}

	/**
	 * Record authentication cache hit.
	 * Call this when session is found in cache.
	 */
	recordAuthCacheHit(): void {
		this.counters.auth.cacheHits++;
	}

	/**
	 * Record authentication cache miss.
	 * Call this when session must be fetched from database.
	 */
	recordAuthCacheMiss(): void {
		this.counters.auth.cacheMisses++;
	}

	// --- API METRICS ---

	/**
	 * Increment API request counter.
	 * Call this for each API request processed.
	 */
	incrementApiRequests(): void {
		this.counters.api.requests++;
	}

	/**
	 * Increment API error counter.
	 * Call this when an API request fails.
	 */
	incrementApiErrors(): void {
		this.counters.api.errors++;
	}

	/**
	 * Record API cache hit.
	 * Call this when API response is served from cache.
	 */
	recordApiCacheHit(): void {
		this.counters.api.cacheHits++;
	}

	/**
	 * Record API cache miss.
	 * Call this when API response must be generated.
	 */
	recordApiCacheMiss(): void {
		this.counters.api.cacheMisses++;
	}

	// --- SECURITY METRICS ---

	/**
	 * Increment rate limit violation counter.
	 * Call this when a request is rate limited.
	 */
	incrementRateLimitViolations(): void {
		this.counters.security.rateLimitViolations++;
	}

	/**
	 * Increment CSP violation counter.
	 * Call this when a CSP violation is detected.
	 */
	incrementCSPViolations(): void {
		this.counters.security.cspViolations++;
	}

	/**
	 * Increment security violations counter.
	 */
	incrementSecurityViolations(): void {
		this.counters.security.cspViolations++; // Using CSP counter for now, can be extended
	}

	// --- PERFORMANCE METRICS ---

	/**
	 * Record hook execution time for performance analysis.
	 * @param hookName - Name of the hook
	 * @param timeMs - Execution time in milliseconds
	 */
	recordHookExecutionTime(hookName: string, timeMs: number): void {
		this.counters.performance.totalHookTime += timeMs;
		this.counters.performance.hookExecutions++;

		// Track potential bottlenecks (hooks taking >100ms)
		if (timeMs > 100) {
			const current = this.counters.performance.bottlenecks.get(hookName) || 0;
			this.counters.performance.bottlenecks.set(hookName, current + 1);
		}
	}

	// --- REPORTING ---

	// Generate a comprehensive metrics report
	getReport(): MetricsReport {
		const now = Date.now();
		const uptime = now - this.counters.startTime;

		// Calculate rates with safe division
		const safeRate = (numerator: number, denominator: number): number => (denominator > 0 ? (numerator / denominator) * 100 : 0);

		const avgResponseTime = this.counters.requests.total > 0 ? this.counters.requests.totalResponseTime / this.counters.requests.total : 0;

		const avgHookTime =
			this.counters.performance.hookExecutions > 0 ? this.counters.performance.totalHookTime / this.counters.performance.hookExecutions : 0;

		// Get top bottlenecks
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
	reset(): void {
		this.counters = new MetricsCounters();
		logger.trace('Unified metrics reset');
	}

	// Export metrics in Prometheus format for monitoring systems
	exportPrometheus(): string {
		const report = this.getReport();
		const lines: string[] = [];

		// Request metrics
		lines.push(`# HELP svelty_requests_total Total number of requests`);
		lines.push(`# TYPE svelty_requests_total counter`);
		lines.push(`svelty_requests_total ${report.requests.total}`);

		lines.push(`# HELP svelty_requests_errors_total Total number of request errors`);
		lines.push(`# TYPE svelty_requests_errors_total counter`);
		lines.push(`svelty_requests_errors_total ${report.requests.errors}`);

		// Authentication metrics
		lines.push(`# HELP svelty_auth_cache_hit_rate Authentication cache hit rate`);
		lines.push(`# TYPE svelty_auth_cache_hit_rate gauge`);
		lines.push(`svelty_auth_cache_hit_rate ${report.authentication.cacheHitRate / 100}`);

		// API metrics
		lines.push(`# HELP svelty_api_cache_hit_rate API cache hit rate`);
		lines.push(`# TYPE svelty_api_cache_hit_rate gauge`);
		lines.push(`svelty_api_cache_hit_rate ${report.api.cacheHitRate / 100}`);

		// Security metrics
		lines.push(`# HELP svelty_security_violations_total Total security violations`);
		lines.push(`# TYPE svelty_security_violations_total counter`);
		lines.push(`svelty_security_violations_total{type="rate_limit"} ${report.security.rateLimitViolations}`);
		lines.push(`svelty_security_violations_total{type="csp"} ${report.security.cspViolations}`);

		return lines.join('\n') + '\n';
	}

	// Cleanup resources when shutting down
	destroy(): void {
		if (this.resetInterval) {
			clearInterval(this.resetInterval);
			this.resetInterval = null;
		}
	}
}

// --- SINGLETON INSTANCE ---

/**
 * Global metrics service instance.
 * Use this throughout the application for consistent metrics collection.
 */
const globalWithMetrics = globalThis as typeof globalThis & {
	__SVELTY_METRICS_INSTANCE__?: MetricsService;
	__SVELTY_PROCESS_CLEANUP_REGISTERED__?: boolean;
};

export const metricsService = (() => {
	if (!globalWithMetrics.__SVELTY_METRICS_INSTANCE__) {
		globalWithMetrics.__SVELTY_METRICS_INSTANCE__ = new MetricsService();
	}
	return globalWithMetrics.__SVELTY_METRICS_INSTANCE__;
})();

/**
 * Cleanup function for graceful shutdown.
 * Call this when the application is shutting down.
 */
export const cleanupMetrics = (): void => {
	metricsService.destroy();
};

// Cleanup on process exit
if (!building && !globalWithMetrics.__SVELTY_PROCESS_CLEANUP_REGISTERED__) {
	process.on('SIGTERM', cleanupMetrics);
	process.on('SIGINT', cleanupMetrics);
	globalWithMetrics.__SVELTY_PROCESS_CLEANUP_REGISTERED__ = true;
}
