/**
 * @file src/routes/api/security/stats/+server.ts
 * @description Security statistics API endpoint for real-time monitoring
 *
 * ### Features
 * - Real-time security metrics aggregation
 * - Threat level distribution analysis
 * - Performance metrics integration
 * - Rate limiting and access control
 * - Comprehensive security overview
 *
 * @security Admin-only endpoint with rate limiting
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { securityResponseService } from '@src/services/SecurityResponseService';
import { metricsService } from '@src/services/MetricsService';
import { hasApiPermission } from '@src/databases/auth/apiPermissions';
import { logger } from '@utils/logger.server';

/**
 * GET /api/security/stats
 * Returns comprehensive security statistics for dashboard monitoring.
 */
export const GET: RequestHandler = async ({ locals, getClientAddress }) => {
	try {
		// Authorization check - admin only
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			logger.warn(`Unauthorized security stats access attempt`, {
				userId: locals.user?._id,
				role: locals.user?.role,
				ip: getClientAddress()
			});
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}

		// Get security statistics from the security response service
		const securityStats = securityResponseService.getSecurityStats();

		// Get general metrics from the metrics service
		const metricsReport = metricsService.getReport();

		// Generate recent security events (mock data for now - would come from event log)
		const recentEvents = generateRecentSecurityEvents();

		// Compile comprehensive security overview
		const response = {
			timestamp: Date.now(),
			overallStatus: calculateOverallSecurityStatus(securityStats, metricsReport),

			// Core security metrics
			activeIncidents: securityStats.activeIncidents,
			blockedIPs: securityStats.blockedIPs,
			throttledIPs: securityStats.throttledIPs,
			totalIncidents: securityStats.totalIncidents,

			// Threat distribution
			threatLevelDistribution: securityStats.threatLevelDistribution,

			// Security events
			cspViolations: metricsReport.security.cspViolations,
			rateLimitHits: metricsReport.security.rateLimitViolations,
			authFailures: metricsReport.security.authFailures,

			// Recent activity
			recentEvents: recentEvents.slice(0, 10), // Last 10 events

			// Performance impact
			securityOverhead: {
				avgResponseTime: metricsReport.requests.avgResponseTime,
				errorRate: metricsReport.requests.errorRate,
				slowRequests: metricsReport.performance.slowRequests
			},

			// System health correlation
			systemHealth: {
				authSuccessRate: metricsReport.authentication.successRate,
				cacheHitRate: metricsReport.api.cacheHitRate,
				uptime: metricsReport.uptime
			}
		};

		logger.debug('Security stats requested', {
			userId: locals.user._id,
			activeIncidents: securityStats.activeIncidents,
			overallStatus: response.overallStatus
		});

		return json(response);
	} catch (error) {
		logger.error('Error fetching security stats:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Calculate overall security status based on multiple factors.
 */
function calculateOverallSecurityStatus(
	securityStats: ReturnType<typeof securityResponseService.getSecurityStats>,
	metricsReport: ReturnType<typeof metricsService.getReport>
): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
	const { threatLevelDistribution, activeIncidents } = securityStats;
	const { security } = metricsReport;

	// Critical indicators
	if (threatLevelDistribution.critical > 0 || activeIncidents > 10) {
		return 'critical';
	}

	// High threat indicators
	if (threatLevelDistribution.high > 0 || activeIncidents > 5 || security.cspViolations > 100 || security.authFailures > 50) {
		return 'high';
	}

	// Medium threat indicators
	if (threatLevelDistribution.medium > 0 || activeIncidents > 2 || security.rateLimitViolations > 50 || security.cspViolations > 20) {
		return 'medium';
	}

	// Low threat indicators
	if (threatLevelDistribution.low > 0 || activeIncidents > 0 || security.rateLimitViolations > 10 || security.authFailures > 10) {
		return 'low';
	}

	return 'safe';
}

/**
 * Generate recent security events for the timeline.
 * In a real implementation, this would query an event log database.
 */
function generateRecentSecurityEvents() {
	const events = [];
	const now = Date.now();

	// This is mock data - replace with actual event log queries
	const eventTypes = [
		{ type: 'rate_limit', severity: 'medium', message: 'Rate limit exceeded for API endpoint' },
		{ type: 'auth_failure', severity: 'low', message: 'Invalid login attempt detected' },
		{ type: 'csp_violation', severity: 'medium', message: 'Content Security Policy violation reported' },
		{ type: 'threat_detected', severity: 'high', message: 'SQL injection pattern detected in request' },
		{ type: 'ip_blocked', severity: 'high', message: 'IP address automatically blocked due to threats' }
	];

	// Generate 5-15 recent events
	const eventCount = Math.floor(Math.random() * 10) + 5;
	for (let i = 0; i < eventCount; i++) {
		const eventTemplate = eventTypes[Math.floor(Math.random() * eventTypes.length)];
		events.push({
			id: `evt_${now}_${i}`,
			timestamp: now - i * 60000 - Math.random() * 300000, // Random time in last 5 minutes to 5 hours
			type: eventTemplate.type,
			severity: eventTemplate.severity,
			message: eventTemplate.message,
			ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
			details: {
				userAgent: 'Mozilla/5.0...',
				endpoint: '/api/data',
				method: 'POST'
			}
		});
	}

	return events.sort((a, b) => b.timestamp - a.timestamp);
}
