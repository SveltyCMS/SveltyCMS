import { l as logger } from './logger.server.js';
import { m as metricsService } from './MetricsService.js';
import { b as building } from './environment.js';
const DEFAULT_POLICIES = [
	{
		name: 'Moderate Threat Response',
		threatLevel: 'medium',
		triggers: {
			indicatorThreshold: 3,
			timeWindow: 5 * 60 * 1e3,
			// 5 minutes
			severityThreshold: 5
		},
		responses: ['warn', 'throttle'],
		cooldownPeriod: 15 * 60 * 1e3
		// 15 minutes
	},
	{
		name: 'High Threat Response',
		threatLevel: 'high',
		triggers: {
			indicatorThreshold: 5,
			timeWindow: 10 * 60 * 1e3,
			// 10 minutes
			severityThreshold: 7
		},
		responses: ['warn', 'block'],
		cooldownPeriod: 30 * 60 * 1e3
		// 30 minutes
	},
	{
		name: 'Critical Threat Response',
		threatLevel: 'critical',
		triggers: {
			indicatorThreshold: 3,
			timeWindow: 5 * 60 * 1e3,
			// 5 minutes
			severityThreshold: 9
		},
		responses: ['warn', 'blacklist'],
		cooldownPeriod: 60 * 60 * 1e3
		// 1 hour
	}
];
class SecurityResponseService {
	incidents = /* @__PURE__ */ new Map();
	blockedIPs = /* @__PURE__ */ new Set();
	throttledIPs = /* @__PURE__ */ new Map();
	policies = [];
	cleanupInterval = null;
	// Pre-compiled regex patterns for performance and ReDoS prevention
	patterns = {
		sqli: [
			/(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
			/((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
			/\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
			/((\%27)|(\'))union/i,
			/exec(\s|\+)+(s|x)p\w+/i
		],
		xss: [
			/((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i,
			/((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i,
			/((\%3C)|<)[^\n]+((\%3E)|>)/i
		],
		pathTraversal: [
			/(\.\.(\/|\\))/i,
			// Basic ../
			/(\%2e\%2e(\%2f|\%5c))/i
			// Encoded ../
		],
		suspicious_ua: [/sqlmap/i, /nikto/i, /burpsuite/i, /nmap/i, /masscan/i, /bot/i]
	};
	constructor() {
		this.policies = [...DEFAULT_POLICIES];
		if (!building) {
			this.cleanupInterval = setInterval(
				() => {
					this.cleanupOldIncidents();
				},
				60 * 60 * 1e3
			);
		}
	}
	// --- THREAT DETECTION ---
	/**
	 * Analyzes a request for potential security threats.
	 */
	async analyzeRequest(request, clientIp) {
		if (this.isBlocked(clientIp)) {
			return {
				level: 'critical',
				action: 'block',
				reason: 'IP is in blocklist'
			};
		}
		const rateLimitResult = await this.checkRateLimit(clientIp);
		if (!rateLimitResult.allowed) {
			return {
				level: 'high',
				action: 'throttle',
				reason: 'Rate limit exceeded'
			};
		}
		const threatLevel = await this.analyzePayload(request);
		if (threatLevel === 'critical') {
			await this.blockIp(clientIp, 'Critical threat detected in payload');
			return { level: 'critical', action: 'block', reason: 'Malicious payload detected' };
		} else if (threatLevel === 'high') {
			return { level: 'high', action: 'challenge', reason: 'Suspicious payload detected' };
		}
		return { level: 'none', action: 'allow' };
	}
	/**
	 * Analyzes the request payload (URL, body, headers) for threats.
	 */
	async analyzePayload(request) {
		const url = new URL(request.url);
		const queryString = url.search;
		const body = request.method !== 'GET' ? await request.clone().text() : '';
		const allContent = `${url.pathname} ${queryString} ${body}`;
		const userAgent = request.headers.get('user-agent') || '';
		for (const pattern of this.patterns.sqli) {
			if (pattern.test(allContent)) return 'critical';
		}
		for (const pattern of this.patterns.xss) {
			if (pattern.test(allContent)) return 'high';
		}
		for (const pattern of this.patterns.pathTraversal) {
			if (pattern.test(allContent)) return 'high';
		}
		for (const pattern of this.patterns.suspicious_ua) {
			if (pattern.test(userAgent)) return 'medium';
		}
		return 'none';
	}
	/**
	 * Checks if the IP has exceeded rate limits.
	 * (Placeholder for actual rate limit logic, possibly using Redis)
	 */
	async checkRateLimit(ip) {
		const throttle = this.throttledIPs.get(ip);
		if (throttle && Date.now() < throttle.until) {
			return { allowed: false };
		}
		return { allowed: true };
	}
	/**
	 * Blocks an IP address.
	 */
	async blockIp(ip, reason) {
		this.blockedIPs.add(ip);
		logger.warn(`IP blocked: ${ip}. Reason: ${reason}`);
		this.reportSecurityEvent(ip, 'ip_reputation', 10, reason);
	}
	// Report a security event (rate limit hit, auth failure, etc.)
	reportSecurityEvent(ip, eventType, severity, evidence, metadata) {
		const indicator = {
			type: eventType,
			severity,
			evidence,
			timestamp: Date.now(),
			metadata
		};
		this.processIndicator(ip, indicator);
	}
	// Process a threat indicator and determine response
	processIndicator(ip, indicator) {
		let incident = this.incidents.get(ip);
		if (!incident) {
			incident = {
				id: `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				clientIp: ip,
				threatLevel: 'none',
				indicators: [],
				responseActions: [],
				timestamp: Date.now(),
				resolved: false
			};
			this.incidents.set(ip, incident);
		}
		incident.indicators.push(indicator);
		this.evaluateIncident(incident);
	}
	// Evaluate an incident and determine appropriate response
	evaluateIncident(incident) {
		const now = Date.now();
		for (const policy of this.policies) {
			const recentIndicators = incident.indicators.filter(
				(ind) => now - ind.timestamp <= policy.triggers.timeWindow && ind.severity >= policy.triggers.severityThreshold
			);
			if (recentIndicators.length >= policy.triggers.indicatorThreshold) {
				incident.threatLevel = policy.threatLevel;
				incident.responseActions = [...policy.responses];
				this.executeResponse(incident, policy);
				break;
			}
		}
	}
	// Execute security response actions
	executeResponse(incident, policy) {
		const ip = incident.clientIp;
		for (const action of policy.responses) {
			switch (action) {
				case 'monitor':
					break;
				case 'warn':
					logger.warn(`Security incident detected`, {
						ip,
						threatLevel: incident.threatLevel,
						indicatorCount: incident.indicators.length,
						incidentId: incident.id
					});
					break;
				case 'throttle': {
					const throttleUntil = Date.now() + policy.cooldownPeriod;
					this.throttledIPs.set(ip, {
						until: throttleUntil,
						factor: this.getThrottleFactor(incident.threatLevel)
					});
					logger.warn(`IP throttled due to security threat`, {
						ip,
						throttleUntil: new Date(throttleUntil),
						factor: this.getThrottleFactor(incident.threatLevel)
					});
					break;
				}
				case 'block': {
					const blockUntil = Date.now() + policy.cooldownPeriod;
					this.blockedIPs.add(ip);
					setTimeout(() => {
						this.blockedIPs.delete(ip);
						logger.info(`IP unblocked after cooldown period`, { ip });
					}, policy.cooldownPeriod);
					logger.error(`IP blocked due to security threat`, {
						ip,
						blockUntil: new Date(blockUntil),
						incidentId: incident.id
					});
					break;
				}
				case 'blacklist':
					this.blockedIPs.add(ip);
					logger.error(`IP blacklisted due to critical security threat`, {
						ip,
						incidentId: incident.id,
						permanent: true
					});
					break;
			}
		}
		metricsService.incrementRateLimitViolations();
	}
	// Get throttle factor based on threat level
	getThrottleFactor(threatLevel) {
		switch (threatLevel) {
			case 'low':
				return 2;
			case 'medium':
				return 5;
			case 'high':
				return 10;
			case 'critical':
				return 20;
			default:
				return 1;
		}
	}
	// --- PUBLIC API ---
	// Check if an IP is currently blocked
	isBlocked(ip) {
		return this.blockedIPs.has(ip);
	}
	// Check if an IP is currently throttled and get throttle factor
	getThrottleStatus(ip) {
		const throttle = this.throttledIPs.get(ip);
		if (!throttle || Date.now() > throttle.until) {
			this.throttledIPs.delete(ip);
			return { throttled: false, factor: 1 };
		}
		return { throttled: true, factor: throttle.factor };
	}
	/**
	 * Get all active security incidents.
	 */
	getActiveIncidents() {
		return Array.from(this.incidents.values()).filter((inc) => !inc.resolved);
	}
	/**
	 * Get security statistics for monitoring.
	 */
	getSecurityStats() {
		const incidents = Array.from(this.incidents.values());
		const threatDistribution = {
			none: 0,
			low: 0,
			medium: 0,
			high: 0,
			critical: 0
		};
		incidents.forEach((inc) => {
			threatDistribution[inc.threatLevel]++;
		});
		return {
			activeIncidents: incidents.filter((inc) => !inc.resolved).length,
			blockedIPs: this.blockedIPs.size,
			throttledIPs: this.throttledIPs.size,
			totalIncidents: incidents.length,
			threatLevelDistribution: threatDistribution
		};
	}
	/**
	 * Manually resolve an incident.
	 */
	resolveIncident(incidentId, notes) {
		for (const incident of this.incidents.values()) {
			if (incident.id === incidentId) {
				incident.resolved = true;
				incident.notes = notes;
				return true;
			}
		}
		return false;
	}
	/**
	 * Manually unblock an IP address.
	 */
	unblockIP(ip) {
		if (this.blockedIPs.has(ip)) {
			this.blockedIPs.delete(ip);
			this.throttledIPs.delete(ip);
			logger.info(`IP manually unblocked`, { ip });
			return true;
		}
		return false;
	}
	// --- CLEANUP ---
	/**
	 * Clean up old incidents and expired blocks.
	 */
	cleanupOldIncidents() {
		const now = Date.now();
		const maxAge = 24 * 60 * 60 * 1e3;
		for (const [ip, incident] of this.incidents.entries()) {
			if (now - incident.timestamp > maxAge && incident.resolved) {
				this.incidents.delete(ip);
			}
		}
		for (const [ip, throttle] of this.throttledIPs.entries()) {
			if (now > throttle.until) {
				this.throttledIPs.delete(ip);
			}
		}
		logger.trace('Security incidents cleanup completed');
	}
	/**
	 * Cleanup resources when shutting down.
	 */
	destroy() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
}
const securityResponseService = new SecurityResponseService();
const cleanupSecurityService = () => {
	securityResponseService.destroy();
};
if (!building && typeof process !== 'undefined' && typeof window === 'undefined') {
	process.on('SIGTERM', cleanupSecurityService);
	process.on('SIGINT', cleanupSecurityService);
}
export { securityResponseService as s };
//# sourceMappingURL=SecurityResponseService.js.map
