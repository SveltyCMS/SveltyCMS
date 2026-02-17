/**
 * @file src/routes/api/metrics/unified/+server.ts
 * @description Unified metrics API endpoint for dashboard widgets
 *
 * ### Features
 * - Comprehensive metrics from MetricsService
 * - Real-time performance data
 * - Security metrics integration
 * - Cache and authentication statistics
 * - Performance bottleneck identification
 *
 * @endpoint GET /api/metrics/unified
 */

import { metricsService } from '@src/services/MetricsService';
import { json } from '@sveltejs/kit';
/**
 * GET /api/metrics/unified
 * Returns comprehensive system metrics for dashboard monitoring.
 */
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

/**
 * GET /api/metrics/unified
 * Returns comprehensive system metrics for dashboard monitoring.
 */
export const GET = apiHandler(async ({ locals }) => {
	try {
		// Get comprehensive metrics report
		const metricsReport = metricsService.getReport();

		// Add some additional computed metrics for the dashboard
		const enhancedMetrics = {
			...metricsReport,

			// Enhanced performance indicators
			performance: {
				...metricsReport.performance,

				// Add performance score (0-100)
				performanceScore: calculatePerformanceScore(metricsReport),

				// Response time classification
				responseTimeStatus: classifyResponseTime(metricsReport.requests.avgResponseTime),

				// System load indicators
				systemLoad: {
					high: metricsReport.performance.slowRequests > 10,
					bottlenecksDetected: metricsReport.performance.bottlenecks.length > 0,
					hookPerformanceOk: metricsReport.performance.avgHookExecutionTime < 50
				}
			},

			// Enhanced authentication metrics
			authentication: {
				...metricsReport.authentication,

				// Authentication health indicators
				authHealthy: metricsReport.authentication.successRate > 95,
				cacheEffective: metricsReport.authentication.cacheHitRate > 80,

				// Cache performance classification
				cacheStatus: classifyCachePerformance(metricsReport.authentication.cacheHitRate)
			},

			// Enhanced API metrics
			api: {
				...metricsReport.api,

				// API health indicators
				apiHealthy: metricsReport.api.requests > 0 ? metricsReport.api.errors / metricsReport.api.requests < 0.05 : true,
				cacheEffective: metricsReport.api.cacheHitRate > 70,

				// API performance classification
				errorRateStatus: classifyErrorRate(metricsReport.api.requests > 0 ? (metricsReport.api.errors / metricsReport.api.requests) * 100 : 0)
			},

			// Enhanced security metrics
			security: {
				...metricsReport.security,

				// Security threat level
				threatLevel: calculateThreatLevel(metricsReport.security),

				// Security status indicators
				securityHealthy:
					metricsReport.security.rateLimitViolations < 20 && metricsReport.security.cspViolations < 10 && metricsReport.security.authFailures < 10
			},

			// System metadata
			metadata: {
				lastUpdated: Date.now(),
				dataSource: 'MetricsService',
				version: '1.0',
				isRealTime: true
			}
		};

		// Log metrics access for monitoring
		logger.trace('Unified metrics accessed', {
			userId: locals.user?._id || 'anonymous',
			performanceScore: enhancedMetrics.performance.performanceScore,
			threatLevel: enhancedMetrics.security.threatLevel
		});

		return json(enhancedMetrics);
	} catch (error) {
		logger.error('Error fetching unified metrics:', error);
		throw new AppError('Failed to fetch metrics', 500, 'METRICS_ERROR');
	}
});

/**
 * Calculate overall performance score (0-100) based on multiple factors.
 */
function calculatePerformanceScore(metrics: ReturnType<typeof metricsService.getReport>): number {
	const factors = {
		// Response time score (0-30 points)
		responseTime: Math.max(0, 30 - metrics.requests.avgResponseTime / 100),

		// Error rate score (0-25 points)
		errorRate: Math.max(0, 25 - metrics.requests.errorRate * 5),

		// Cache efficiency score (0-20 points)
		cacheEfficiency: (metrics.authentication.cacheHitRate + metrics.api.cacheHitRate) / 10,

		// Authentication success score (0-15 points)
		authSuccess: Math.max(0, ((metrics.authentication.successRate - 80) / 20) * 15),

		// Security score (0-10 points)
		security: Math.max(0, 10 - (metrics.security.rateLimitViolations / 5 + metrics.security.cspViolations / 2 + metrics.security.authFailures / 3))
	};

	const totalScore = Math.min(
		100,
		Math.max(0, factors.responseTime + factors.errorRate + factors.cacheEfficiency + factors.authSuccess + factors.security)
	);

	return Math.round(totalScore);
}

/**
 * Classify response time performance.
 */
function classifyResponseTime(avgResponseTime: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
	if (avgResponseTime < 100) {
		return 'excellent';
	}
	if (avgResponseTime < 300) {
		return 'good';
	}
	if (avgResponseTime < 500) {
		return 'fair';
	}
	if (avgResponseTime < 1000) {
		return 'poor';
	}
	return 'critical';
}

/**
 * Classify cache performance.
 */
function classifyCachePerformance(hitRate: number): 'excellent' | 'good' | 'fair' | 'poor' {
	if (hitRate >= 90) {
		return 'excellent';
	}
	if (hitRate >= 80) {
		return 'good';
	}
	if (hitRate >= 60) {
		return 'fair';
	}
	return 'poor';
}

/**
 * Classify error rate.
 */
function classifyErrorRate(errorRate: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
	if (errorRate < 0.5) {
		return 'excellent';
	}
	if (errorRate < 1) {
		return 'good';
	}
	if (errorRate < 2) {
		return 'fair';
	}
	if (errorRate < 5) {
		return 'poor';
	}
	return 'critical';
}

/**
 * Calculate security threat level.
 */
function calculateThreatLevel(security: {
	rateLimitViolations: number;
	cspViolations: number;
	authFailures: number;
}): 'low' | 'medium' | 'high' | 'critical' {
	const violationScore = security.rateLimitViolations + security.cspViolations * 2 + security.authFailures * 1.5;

	if (violationScore >= 100) {
		return 'critical';
	}
	if (violationScore >= 50) {
		return 'high';
	}
	if (violationScore >= 20) {
		return 'medium';
	}
	return 'low';
}
