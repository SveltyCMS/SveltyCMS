import { json } from '@sveltejs/kit';
import { s as securityResponseService } from '../../../../../chunks/SecurityResponseService.js';
import { m as metricsService } from '../../../../../chunks/MetricsService.js';
import { h as hasApiPermission } from '../../../../../chunks/apiPermissions.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ locals, getClientAddress }) => {
	try {
		if (!locals.user || !hasApiPermission(locals.user.role, 'security')) {
			logger.warn(`Unauthorized security stats access attempt`, {
				userId: locals.user?._id,
				role: locals.user?.role,
				ip: getClientAddress()
			});
			return json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
		}
		const securityStats = securityResponseService.getSecurityStats();
		const metricsReport = metricsService.getReport();
		const recentEvents = generateRecentSecurityEvents();
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
			recentEvents: recentEvents.slice(0, 10),
			// Last 10 events
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
function calculateOverallSecurityStatus(securityStats, metricsReport) {
	const { threatLevelDistribution, activeIncidents } = securityStats;
	const { security } = metricsReport;
	if (threatLevelDistribution.critical > 0 || activeIncidents > 10) {
		return 'critical';
	}
	if (threatLevelDistribution.high > 0 || activeIncidents > 5 || security.cspViolations > 100 || security.authFailures > 50) {
		return 'high';
	}
	if (threatLevelDistribution.medium > 0 || activeIncidents > 2 || security.rateLimitViolations > 50 || security.cspViolations > 20) {
		return 'medium';
	}
	if (threatLevelDistribution.low > 0 || activeIncidents > 0 || security.rateLimitViolations > 10 || security.authFailures > 10) {
		return 'low';
	}
	return 'safe';
}
function generateRecentSecurityEvents() {
	const events = [];
	const now = Date.now();
	const eventTypes = [
		{ type: 'rate_limit', severity: 'medium', message: 'Rate limit exceeded for API endpoint' },
		{ type: 'auth_failure', severity: 'low', message: 'Invalid login attempt detected' },
		{ type: 'csp_violation', severity: 'medium', message: 'Content Security Policy violation reported' },
		{ type: 'threat_detected', severity: 'high', message: 'SQL injection pattern detected in request' },
		{ type: 'ip_blocked', severity: 'high', message: 'IP address automatically blocked due to threats' }
	];
	const eventCount = Math.floor(Math.random() * 10) + 5;
	for (let i = 0; i < eventCount; i++) {
		const eventTemplate = eventTypes[Math.floor(Math.random() * eventTypes.length)];
		events.push({
			id: `evt_${now}_${i}`,
			timestamp: now - i * 6e4 - Math.random() * 3e5,
			// Random time in last 5 minutes to 5 hours
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
export { GET };
//# sourceMappingURL=_server.ts.js.map
