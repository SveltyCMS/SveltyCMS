/**
 * @file src/services/SecurityResponseService.ts
 * @description Automated security response system with dynamic threat detection
 *
 * ### Features
 * - Real-time threat detection and classification
 * - Dynamic rate limiting based on threat level
 * - Automated IP blocking for severe threats
 * - Security incident reporting and alerting
 * - Integration with existing rate limiter
 * - Configurable response policies
 *
 * ### Threat Detection
 * - **Level 1 (Low)**: Unusual request patterns, minor policy violations
 * - **Level 2 (Medium)**: Repeated CSP violations, auth failures, rate limit hits
 * - **Level 3 (High)**: SQL injection attempts, XSS patterns, brute force
 * - **Level 4 (Critical)**: Active attacks, coordinated threats, system intrusion
 *
 * @enterprise Advanced threat detection for production environments
 */

import { logger } from '@utils/logger.svelte';
import { metricsService } from './MetricsService';
import { building } from '$app/environment';

// --- TYPES ---

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ResponseAction = 'monitor' | 'warn' | 'throttle' | 'block' | 'blacklist';

export interface ThreatIndicator {
	type: 'rate_limit' | 'auth_failure' | 'csp_violation' | 'sql_injection' | 'xss_attempt' | 'brute_force' | 'suspicious_ua' | 'ip_reputation';
	severity: number; // 1-10 scale
	evidence: string;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

export interface SecurityIncident {
	id: string;
	clientIp: string;
	userAgent?: string;
	threatLevel: ThreatLevel;
	indicators: ThreatIndicator[];
	responseActions: ResponseAction[];
	timestamp: number;
	resolved: boolean;
	notes?: string;
}

export interface SecurityPolicy {
	name: string;
	threatLevel: ThreatLevel;
	triggers: {
		indicatorThreshold: number; // Number of indicators needed
		timeWindow: number; // Time window in milliseconds
		severityThreshold: number; // Minimum severity score
	};
	responses: ResponseAction[];
	cooldownPeriod: number; // How long to maintain response
}

// --- SECURITY POLICIES ---

const DEFAULT_POLICIES: SecurityPolicy[] = [
	{
		name: 'Moderate Threat Response',
		threatLevel: 'medium',
		triggers: {
			indicatorThreshold: 3,
			timeWindow: 5 * 60 * 1000, // 5 minutes
			severityThreshold: 5
		},
		responses: ['warn', 'throttle'],
		cooldownPeriod: 15 * 60 * 1000 // 15 minutes
	},
	{
		name: 'High Threat Response',
		threatLevel: 'high',
		triggers: {
			indicatorThreshold: 5,
			timeWindow: 10 * 60 * 1000, // 10 minutes
			severityThreshold: 7
		},
		responses: ['warn', 'block'],
		cooldownPeriod: 30 * 60 * 1000 // 30 minutes
	},
	{
		name: 'Critical Threat Response',
		threatLevel: 'critical',
		triggers: {
			indicatorThreshold: 3,
			timeWindow: 5 * 60 * 1000, // 5 minutes
			severityThreshold: 9
		},
		responses: ['warn', 'blacklist'],
		cooldownPeriod: 60 * 60 * 1000 // 1 hour
	}
];

// --- THREAT PATTERNS ---

const THREAT_PATTERNS = {
	SQL_INJECTION: [
		/(\bUNION\b.*\bSELECT\b)/i,
		/(\bOR\b.*\b1\s*=\s*1\b)/i,
		/(\bDROP\b.*\bTABLE\b)/i,
		/(\bINSERT\b.*\bINTO\b)/i,
		/(\/\*.*\*\/)/,
		/(\b(AND|OR)\b.*\b\d+\s*=\s*\d+\b)/i
	],
	XSS_PATTERNS: [/<script[^>]*>.*?<\/script>/i, /javascript:/i, /on\w+\s*=/i, /<iframe[^>]*>/i, /eval\s*\(/i, /document\.cookie/i],
	SUSPICIOUS_USER_AGENTS: [/sqlmap/i, /nikto/i, /burpsuite/i, /nmap/i, /masscan/i, /bot/i]
};

// --- SECURITY RESPONSE SERVICE ---

class SecurityResponseService {
	private incidents = new Map<string, SecurityIncident>();
	private blockedIPs = new Set<string>();
	private throttledIPs = new Map<string, { until: number; factor: number }>();
	private policies: SecurityPolicy[] = [];
	private cleanupInterval: NodeJS.Timeout | null = null;

	constructor() {
		this.policies = [...DEFAULT_POLICIES];

		// Cleanup old incidents every hour
		if (!building) {
			this.cleanupInterval = setInterval(
				() => {
					this.cleanupOldIncidents();
				},
				60 * 60 * 1000
			);
		}
	}

	// --- THREAT DETECTION ---

	/**
	 * Analyze a request for potential threats.
	 * Returns threat indicators found in the request.
	 */
	analyzeRequest(_ip: string, userAgent: string | null, url: string, _headers: Record<string, string>, body?: string): ThreatIndicator[] {
		const indicators: ThreatIndicator[] = [];
		const now = Date.now();

		// Check for SQL injection patterns
		const queryString = new URL(`http://example.com${url}`).search;
		const allContent = `${url} ${queryString} ${body || ''}`;

		for (const pattern of THREAT_PATTERNS.SQL_INJECTION) {
			if (pattern.test(allContent)) {
				indicators.push({
					type: 'sql_injection',
					severity: 9,
					evidence: `SQL injection pattern detected: ${pattern.source}`,
					timestamp: now,
					metadata: { url, pattern: pattern.source }
				});
			}
		}

		// Check for XSS patterns
		for (const pattern of THREAT_PATTERNS.XSS_PATTERNS) {
			if (pattern.test(allContent)) {
				indicators.push({
					type: 'xss_attempt',
					severity: 8,
					evidence: `XSS pattern detected: ${pattern.source}`,
					timestamp: now,
					metadata: { url, pattern: pattern.source }
				});
			}
		}

		// Check for suspicious user agents
		if (userAgent) {
			for (const pattern of THREAT_PATTERNS.SUSPICIOUS_USER_AGENTS) {
				if (pattern.test(userAgent)) {
					indicators.push({
						type: 'suspicious_ua',
						severity: 6,
						evidence: `Suspicious user agent: ${userAgent}`,
						timestamp: now,
						metadata: { userAgent }
					});
				}
			}
		}

		return indicators;
	}

	// Report a security event (rate limit hit, auth failure, etc.)
	reportSecurityEvent(ip: string, eventType: ThreatIndicator['type'], severity: number, evidence: string, metadata?: Record<string, unknown>): void {
		const indicator: ThreatIndicator = {
			type: eventType,
			severity,
			evidence,
			timestamp: Date.now(),
			metadata
		};

		this.processIndicator(ip, indicator);
	}

	// Process a threat indicator and determine response
	private processIndicator(ip: string, indicator: ThreatIndicator): void {
		// Get or create incident for this IP
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

		// Add indicator to incident
		incident.indicators.push(indicator);

		// Evaluate threat level and determine response
		this.evaluateIncident(incident);
	}

	// Evaluate an incident and determine appropriate response
	private evaluateIncident(incident: SecurityIncident): void {
		const now = Date.now();

		// Filter recent indicators (within time windows)
		for (const policy of this.policies) {
			const recentIndicators = incident.indicators.filter(
				(ind) => now - ind.timestamp <= policy.triggers.timeWindow && ind.severity >= policy.triggers.severityThreshold
			);

			if (recentIndicators.length >= policy.triggers.indicatorThreshold) {
				// Policy triggered - escalate response
				incident.threatLevel = policy.threatLevel;
				incident.responseActions = [...policy.responses];

				this.executeResponse(incident, policy);
				break;
			}
		}
	}

	// Execute security response actions
	private executeResponse(incident: SecurityIncident, policy: SecurityPolicy): void {
		const ip = incident.clientIp;

		for (const action of policy.responses) {
			switch (action) {
				case 'monitor':
					// Just log - no action
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

					// Schedule unblock
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

		// Track security response metrics
		metricsService.incrementRateLimitViolations();
	}

	// Get throttle factor based on threat level
	private getThrottleFactor(threatLevel: ThreatLevel): number {
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
	isBlocked(ip: string): boolean {
		return this.blockedIPs.has(ip);
	}

	// Check if an IP is currently throttled and get throttle factor
	getThrottleStatus(ip: string): { throttled: boolean; factor: number } {
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
	getActiveIncidents(): SecurityIncident[] {
		return Array.from(this.incidents.values()).filter((inc) => !inc.resolved);
	}

	/**
	 * Get security statistics for monitoring.
	 */
	getSecurityStats(): {
		activeIncidents: number;
		blockedIPs: number;
		throttledIPs: number;
		totalIncidents: number;
		threatLevelDistribution: Record<ThreatLevel, number>;
	} {
		const incidents = Array.from(this.incidents.values());
		const threatDistribution: Record<ThreatLevel, number> = {
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
	resolveIncident(incidentId: string, notes?: string): boolean {
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
	unblockIP(ip: string): boolean {
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
	private cleanupOldIncidents(): void {
		const now = Date.now();
		const maxAge = 24 * 60 * 60 * 1000; // 24 hours

		// Remove old incidents
		for (const [ip, incident] of this.incidents.entries()) {
			if (now - incident.timestamp > maxAge && incident.resolved) {
				this.incidents.delete(ip);
			}
		}

		// Remove expired throttles
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
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
}

// --- SINGLETON INSTANCE ---

/**
 * Global security response service instance.
 */
export const securityResponseService = new SecurityResponseService();

/**
 * Cleanup function for graceful shutdown.
 */
export const cleanupSecurityService = (): void => {
	securityResponseService.destroy();
};

// Cleanup on process exit
if (!building) {
	process.on('SIGTERM', cleanupSecurityService);
	process.on('SIGINT', cleanupSecurityService);
}
