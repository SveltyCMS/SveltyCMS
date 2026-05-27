/**
 * @file src/services/security-response-service.ts
 * @description Enterprise-grade automated security response system with dynamic threat detection
 *
 * ### Features
 * - Real-time threat detection and classification (SQLi, XSS, command injection, path traversal, LDAP injection)
 * - OWASP-aligned pattern matching with anomaly scoring
 * - Sliding window per-IP rate limiting with per-endpoint overrides
 * - Header and payload anomaly detection (oversized bodies, unusual Content-Types, missing UA)
 * - Automated IP blocking, throttling, and blacklisting
 * - Webhook alerting for critical incidents (Slack/generic JSON)
 * - Security incident reporting, metrics, and admin API
 * - Configurable security policies with escalation
 * - Graceful cleanup with process signal handling
 *
 * @enterprise Advanced threat detection for production environments
 */

import { logger } from '@utils/logger.server';
import { building } from '$app/environment';
import { metricsService } from './metrics-service';

// ============================================================================
// TYPES
// ============================================================================

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ResponseAction = 'monitor' | 'warn' | 'throttle' | 'block' | 'blacklist' | 'challenge' | 'allow';

export interface SecurityStatus {
	action: ResponseAction;
	level: ThreatLevel;
	reason?: string;
}

export interface ThreatIndicator {
	evidence: string;
	metadata?: Record<string, unknown>;
	severity: number; // 1-10 scale
	timestamp: number;
	type:
		| 'rate_limit'
		| 'auth_failure'
		| 'csp_violation'
		| 'sql_injection'
		| 'xss_attempt'
		| 'brute_force'
		| 'suspicious_ua'
		| 'ip_reputation'
		| 'command_injection'
		| 'ldap_injection'
		| 'path_traversal'
		| 'header_anomaly'
		| 'payload_anomaly';
}

export interface SecurityIncident {
	clientIp: string;
	id: string;
	indicators: ThreatIndicator[];
	notes?: string;
	resolved: boolean;
	responseActions: ResponseAction[];
	threatLevel: ThreatLevel;
	timestamp: number;
	userAgent?: string;
}

export interface SecurityPolicy {
	cooldownPeriod: number;
	name: string;
	responses: ResponseAction[];
	threatLevel: ThreatLevel;
	triggers: {
		indicatorThreshold: number;
		timeWindow: number;
		severityThreshold: number;
	};
}

/** Sliding window rate limit tracking */
interface RateLimitEntry {
	timestamps: number[];
}

/** Anomaly detection result */
interface AnomalyResult {
	detected: boolean;
	indicators: ThreatIndicator[];
}

// ============================================================================
// SECURITY POLICIES
// ============================================================================

const DEFAULT_POLICIES: SecurityPolicy[] = [
	{
		name: 'Moderate Threat Response',
		threatLevel: 'medium',
		triggers: { indicatorThreshold: 3, timeWindow: 5 * 60 * 1000, severityThreshold: 5 },
		responses: ['warn', 'throttle'],
		cooldownPeriod: 15 * 60 * 1000
	},
	{
		name: 'High Threat Response',
		threatLevel: 'high',
		triggers: { indicatorThreshold: 5, timeWindow: 10 * 60 * 1000, severityThreshold: 7 },
		responses: ['warn', 'block'],
		cooldownPeriod: 30 * 60 * 1000
	},
	{
		name: 'Critical Threat Response',
		threatLevel: 'critical',
		triggers: { indicatorThreshold: 3, timeWindow: 5 * 60 * 1000, severityThreshold: 9 },
		responses: ['warn', 'blacklist'],
		cooldownPeriod: 60 * 60 * 1000
	}
];

/** Per-endpoint rate limit overrides (requests per minute) */
const ENDPOINT_RATE_LIMITS: Record<string, number> = {
	'/api/auth/login': 5,
	'/api/auth/saml/acs': 10,
	'/api/auth/register': 3,
	'/api/auth/forgot-password': 3,
	'/api/scim/v2': 30
};

/** Default global rate limit: requests per minute per IP */
const GLOBAL_RATE_LIMIT = 100;

/** Maximum request body size for non-media endpoints (10MB) */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

/** Warning threshold for body size (1MB) */
const WARN_BODY_SIZE = 1 * 1024 * 1024;

/** Allowed content types for API endpoints */
const ALLOWED_CONTENT_TYPES = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

// ============================================================================
// SECURITY RESPONSE SERVICE
// ============================================================================

class SecurityResponseService {
	private readonly incidents = new Map<string, SecurityIncident>();
	private readonly blockedIPs = new Set<string>();
	private readonly throttledIPs = new Map<string, { until: number; factor: number }>();
	private readonly policies: SecurityPolicy[] = [];
	private cleanupInterval: NodeJS.Timeout | null = null;

	// Sliding window rate limiter storage
	private readonly rateLimitStore = new Map<string, RateLimitEntry>();

	// Alert rate limiting (prevent alert fatigue)
	private readonly lastAlertTime = new Map<string, number>();
	private readonly ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes between alerts per IP

	// Pre-compiled regex patterns — OWASP-aligned, ReDoS-safe
	private readonly patterns = {
		// SQL Injection patterns (UNION, boolean, time-based, stacked, comment)
		sqli: [
			/(%27)|(')|(--)|(%23)|(#)/i,
			/((%3D)|(=))[^\n]*((%27)|(')|(--)|(%3B)|(;))/i,
			/\w*((%27)|('))((%6F)|o|(%4F))((%72)|r|(%52))/i,
			/((%27)|('))union/i,
			/exec(\s|\+)+(s|x)p\w+/i,
			/\b(union\s+(all\s+)?select|select\s+.*from|insert\s+into|update\s+.*set|delete\s+from|drop\s+(table|database))\b/i,
			/\b(or|and)\s+\d+=\d+/i,
			/\b(waitfor|benchmark|sleep|pg_sleep)\s*\(/i,
			/;\s*(drop|alter|create|truncate|exec)\b/i,
			/\/\*.*\*\//i
		],
		// XSS patterns (tags, event handlers, javascript: URIs, encoded)
		xss: [
			/((%3C)|<)((%2F)|\/)*[a-z0-9%]+((%3E)|>)/i,
			/((%3C)|<)((%69)|i|(%49))((%6D)|m|(%4D))((%67)|g|(%47))[^\n]+((%3E)|>)/i,
			/((%3C)|<)[^\n]+((%3E)|>)/i,
			/\b(on(load|error|click|mouseover|focus|blur|submit|change|input|keyup|keydown))\s*=/i,
			/javascript\s*:/i,
			/\beval\s*\(/i,
			/\bdocument\.(cookie|domain|write|location)/i,
			/\bwindow\.(location|open|eval)/i,
			/<script[^>]*>/i,
			/<iframe[^>]*>/i,
			/<object[^>]*>/i,
			/<embed[^>]*>/i
		],
		// Path traversal
		pathTraversal: [/(\.\.(\/|\\))/i, /(%2e%2e(%2f|%5c))/i, /\.\.(\/|\\){2,}/i],
		// Command injection (pipe, backtick, $(), &&, ||)
		commandInjection: [
			/[;|`]\s*(cat|ls|dir|whoami|id|uname|passwd|shadow|wget|curl|nc|ncat|bash|sh|cmd|powershell)\b/i,
			/\$\([^)]+\)/i,
			/\b(&&|\|\|)\s*(cat|ls|rm|mv|cp|wget|curl)\b/i,
			/`[^`]*`/i
		],
		// LDAP injection
		ldapInjection: [/[()\\*|&]/, /\x00/, /\b(objectClass|cn|uid|sn|givenName|mail)\s*[=~><]/i],
		// Suspicious user agents (scanners, attack tools)
		suspicious_ua: [
			/sqlmap/i,
			/nikto/i,
			/burpsuite/i,
			/nmap/i,
			/masscan/i,
			/dirbuster/i,
			/gobuster/i,
			/wfuzz/i,
			/hydra/i,
			/metasploit/i,
			/acunetix/i,
			/nessus/i,
			/openvas/i,
			/w3af/i,
			/skipfish/i
		]
	};

	constructor() {
		this.policies = [...DEFAULT_POLICIES];

		if (!building) {
			this.cleanupInterval = setInterval(
				() => {
					this.cleanupOldIncidents();
					this.cleanupRateLimitStore();
				},
				60 * 60 * 1000
			);
		}
	}

	// ========================================================================
	// THREAT DETECTION
	// ========================================================================

	/** Analyzes a request for potential security threats. */
	public async analyzeRequest(request: Request, clientIp: string): Promise<SecurityStatus> {
		// 1. Blocklist check (fastest)
		if (this.isBlocked(clientIp)) {
			return { level: 'critical', action: 'block', reason: 'IP is in blocklist' };
		}

		// 2. Rate limit check (fast, per-endpoint aware)
		const url = new URL(request.url);
		const rateLimitResult = this.checkRateLimit(clientIp, url.pathname);
		if (!rateLimitResult.allowed) {
			this.reportSecurityEvent(clientIp, 'rate_limit', 6, `Rate limit exceeded for ${url.pathname}`, {
				endpoint: url.pathname,
				limit: rateLimitResult.limit,
				count: rateLimitResult.count
			});
			return { level: 'high', action: 'throttle', reason: `Rate limit exceeded (${rateLimitResult.count}/${rateLimitResult.limit}/min)` };
		}

		// 3. Header/payload anomaly detection (fast)
		const anomaly = this.detectAnomalies(request);
		if (anomaly.detected) {
			for (const ind of anomaly.indicators) {
				this.processIndicator(clientIp, ind);
			}
			if (anomaly.indicators.some((i) => i.severity >= 8)) {
				return { level: 'high', action: 'challenge', reason: 'Request anomaly detected' };
			}
		}

		// 4. Payload pattern analysis (slower, CPU intensive)
		const threatLevel = await this.analyzePayload(request);
		if (threatLevel === 'critical') {
			await this.blockIp(clientIp, 'Critical threat detected in payload');
			return { level: 'critical', action: 'block', reason: 'Malicious payload detected' };
		}
		if (threatLevel === 'high') {
			return { level: 'high', action: 'challenge', reason: 'Suspicious payload detected' };
		}

		return { level: 'none', action: 'allow' };
	}

	/** Analyzes the request payload for attack patterns. */
	private async analyzePayload(request: Request): Promise<ThreatLevel> {
		const url = new URL(request.url);
		const queryString = url.search;
		const body = request.method !== 'GET' ? await request.clone().text() : '';
		const allContent = `${url.pathname} ${queryString} ${body}`;
		const userAgent = request.headers.get('user-agent') || '';

		// SQL injection (critical)
		for (const pattern of this.patterns.sqli) {
			if (pattern.test(allContent)) return 'critical';
		}

		// Command injection (critical)
		for (const pattern of this.patterns.commandInjection) {
			if (pattern.test(allContent)) return 'critical';
		}

		// XSS (high)
		for (const pattern of this.patterns.xss) {
			if (pattern.test(allContent)) return 'high';
		}

		// Path traversal (high)
		for (const pattern of this.patterns.pathTraversal) {
			if (pattern.test(allContent)) return 'high';
		}

		// LDAP injection (high — relevant for SCIM endpoints)
		if (url.pathname.includes('/scim/')) {
			for (const pattern of this.patterns.ldapInjection) {
				if (pattern.test(allContent)) return 'high';
			}
		}

		// Suspicious user agents (medium)
		for (const pattern of this.patterns.suspicious_ua) {
			if (pattern.test(userAgent)) return 'medium';
		}

		return 'none';
	}

	// ========================================================================
	// SLIDING WINDOW RATE LIMITER
	// ========================================================================

	/** Per-IP sliding window rate limiter with per-endpoint overrides. */
	public checkRateLimit(ip: string, pathname: string): { allowed: boolean; limit: number; count: number } {
		// Check if throttled first
		const throttle = this.throttledIPs.get(ip);
		if (throttle && Date.now() < throttle.until) {
			return { allowed: false, limit: 0, count: 0 };
		}

		// Determine limit for this endpoint
		let limit = GLOBAL_RATE_LIMIT;
		for (const [prefix, endpointLimit] of Object.entries(ENDPOINT_RATE_LIMITS)) {
			if (pathname.startsWith(prefix)) {
				limit = endpointLimit;
				break;
			}
		}

		const key = `${ip}:${pathname}`;
		const now = Date.now();
		const windowMs = 60 * 1000; // 1 minute

		// Get or create entry
		let entry = this.rateLimitStore.get(key);
		if (!entry) {
			entry = { timestamps: [] };
			this.rateLimitStore.set(key, entry);
		}

		// Filter to window
		entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

		// Check limit
		if (entry.timestamps.length >= limit) {
			return { allowed: false, limit, count: entry.timestamps.length };
		}

		// Record this request
		entry.timestamps.push(now);
		return { allowed: true, limit, count: entry.timestamps.length };
	}

	/** Cleanup expired rate limit entries. */
	private cleanupRateLimitStore(): void {
		const now = Date.now();
		const windowMs = 60 * 1000;
		for (const [key, entry] of this.rateLimitStore.entries()) {
			entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
			if (entry.timestamps.length === 0) {
				this.rateLimitStore.delete(key);
			}
		}
	}

	// ========================================================================
	// ANOMALY DETECTION
	// ========================================================================

	/** Detects header and payload anomalies. */
	private detectAnomalies(request: Request): AnomalyResult {
		const indicators: ThreatIndicator[] = [];
		const now = Date.now();

		// Missing User-Agent
		const ua = request.headers.get('user-agent');
		if (!ua || ua.trim() === '') {
			indicators.push({
				type: 'header_anomaly',
				severity: 4,
				evidence: 'Missing User-Agent header',
				timestamp: now
			});
		}

		// Unusual Content-Type for non-GET/HEAD requests
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			const contentType = request.headers.get('content-type');
			if (contentType) {
				const baseType = contentType.split(';')[0].trim().toLowerCase();
				if (!ALLOWED_CONTENT_TYPES.some((t) => baseType.startsWith(t))) {
					indicators.push({
						type: 'header_anomaly',
						severity: 6,
						evidence: `Unusual Content-Type: ${baseType}`,
						timestamp: now,
						metadata: { contentType: baseType }
					});
				}
			}
		}

		// Oversized Content-Length
		const contentLength = request.headers.get('content-length');
		if (contentLength) {
			const size = parseInt(contentLength, 10);
			if (size > MAX_BODY_SIZE) {
				indicators.push({
					type: 'payload_anomaly',
					severity: 8,
					evidence: `Oversized payload: ${(size / 1024 / 1024).toFixed(1)}MB (max ${MAX_BODY_SIZE / 1024 / 1024}MB)`,
					timestamp: now,
					metadata: { size }
				});
			} else if (size > WARN_BODY_SIZE) {
				indicators.push({
					type: 'payload_anomaly',
					severity: 3,
					evidence: `Large payload: ${(size / 1024).toFixed(0)}KB`,
					timestamp: now,
					metadata: { size }
				});
			}
		}

		// Oversized Cookie header (session fixation/cookie bomb detection)
		const cookie = request.headers.get('cookie');
		if (cookie && cookie.length > 8192) {
			indicators.push({
				type: 'header_anomaly',
				severity: 7,
				evidence: `Oversized Cookie header: ${cookie.length} bytes`,
				timestamp: now
			});
		}

		// Proxy header spoofing attempt
		const xff = request.headers.get('x-forwarded-for');
		if (xff && xff.split(',').length > 10) {
			indicators.push({
				type: 'header_anomaly',
				severity: 5,
				evidence: `Excessive X-Forwarded-For entries: ${xff.split(',').length}`,
				timestamp: now
			});
		}

		return { detected: indicators.length > 0, indicators };
	}

	// ========================================================================
	// INCIDENT MANAGEMENT
	// ========================================================================

	/** Blocks an IP address. */
	public async blockIp(ip: string, reason: string): Promise<void> {
		this.blockedIPs.add(ip);
		logger.warn(`IP blocked: ${ip}. Reason: ${reason}`);
		this.reportSecurityEvent(ip, 'ip_reputation', 10, reason);
		await this.dispatchAlert(ip, 'critical', reason);
	}

	/** Report a security event. */
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

	/** Process an indicator and accumulate into incidents. */
	private processIndicator(ip: string, indicator: ThreatIndicator): void {
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

	/** Evaluate an incident and trigger policy responses. */
	private evaluateIncident(incident: SecurityIncident): void {
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

	/** Execute security response actions. */
	private executeResponse(incident: SecurityIncident, policy: SecurityPolicy): void {
		const ip = incident.clientIp;

		for (const action of policy.responses) {
			switch (action) {
				case 'monitor':
					break;
				case 'warn':
					logger.warn('Security incident detected', {
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
					logger.warn('IP throttled', { ip, until: new Date(throttleUntil) });
					break;
				}
				case 'block': {
					this.blockedIPs.add(ip);
					setTimeout(() => {
						this.blockedIPs.delete(ip);
						logger.info('IP unblocked after cooldown', { ip });
					}, policy.cooldownPeriod);
					logger.error('IP blocked', { ip, incidentId: incident.id });
					break;
				}
				case 'blacklist':
					this.blockedIPs.add(ip);
					logger.error('IP blacklisted (permanent)', { ip, incidentId: incident.id });
					break;
			}
		}

		// Dispatch webhook alert for high+ threats
		if (policy.threatLevel === 'high' || policy.threatLevel === 'critical') {
			this.dispatchAlert(ip, policy.threatLevel, `Policy "${policy.name}" triggered`).catch(() => {});
		}

		metricsService.incrementRateLimitViolations();
	}

	// ========================================================================
	// WEBHOOK ALERTING
	// ========================================================================

	/** Dispatches a webhook alert for security incidents. Rate-limited to prevent alert fatigue. */
	public async dispatchAlert(ip: string, threatLevel: ThreatLevel, reason: string): Promise<void> {
		const webhookUrl = this.getWebhookUrl();
		if (!webhookUrl) return;

		// Rate limit alerts per IP
		const lastAlert = this.lastAlertTime.get(ip);
		if (lastAlert && Date.now() - lastAlert < this.ALERT_COOLDOWN) return;
		this.lastAlertTime.set(ip, Date.now());

		const incident = this.incidents.get(ip);
		const payload = {
			type: 'security_alert',
			timestamp: new Date().toISOString(),
			threatLevel,
			clientIp: ip,
			reason,
			incidentId: incident?.id,
			indicatorCount: incident?.indicators.length || 0,
			activeIncidents: this.getActiveIncidents().length,
			blockedIPs: this.blockedIPs.size
		};

		try {
			// Generic JSON webhook
			await fetch(webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(webhookUrl.includes('slack') ? this.formatSlackPayload(payload) : payload),
				signal: AbortSignal.timeout(5000)
			});
			logger.info('Security alert dispatched', { ip, threatLevel });
		} catch (e) {
			logger.warn('Failed to dispatch security alert', { error: e });
		}
	}

	/** Formats payload for Slack webhook. */
	private formatSlackPayload(payload: Record<string, unknown>): Record<string, unknown> {
		const emoji = payload.threatLevel === 'critical' ? '🚨' : '⚠️';
		return {
			text: `${emoji} *SveltyCMS Security Alert*\n*Level:* ${payload.threatLevel}\n*IP:* ${payload.clientIp}\n*Reason:* ${payload.reason}\n*Active Incidents:* ${payload.activeIncidents}`,
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text:
							`${emoji} *Security Alert — ${String(payload.threatLevel).toUpperCase()}*\n` +
							`IP: \`${payload.clientIp}\`\nReason: ${payload.reason}\n` +
							`Indicators: ${payload.indicatorCount} | Active: ${payload.activeIncidents} | Blocked: ${payload.blockedIPs}`
					}
				}
			]
		};
	}

	/** Gets the webhook URL from environment. */
	private getWebhookUrl(): string | null {
		try {
			return process.env.SECURITY_WEBHOOK_URL || null;
		} catch {
			return null;
		}
	}

	// ========================================================================
	// PUBLIC API
	// ========================================================================

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

	isBlocked(ip: string): boolean {
		return this.blockedIPs.has(ip);
	}

	getThrottleStatus(ip: string): { throttled: boolean; factor: number } {
		const throttle = this.throttledIPs.get(ip);
		if (!throttle || Date.now() > throttle.until) {
			this.throttledIPs.delete(ip);
			return { throttled: false, factor: 1 };
		}
		return { throttled: true, factor: throttle.factor };
	}

	getActiveIncidents(): SecurityIncident[] {
		return Array.from(this.incidents.values()).filter((inc) => !inc.resolved);
	}

	getSecurityStats(): {
		activeIncidents: number;
		blockedIPs: number;
		throttledIPs: number;
		totalIncidents: number;
		rateLimitEntries: number;
		threatLevelDistribution: Record<ThreatLevel, number>;
	} {
		const incidents = Array.from(this.incidents.values());
		const threatDistribution: Record<ThreatLevel, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
		incidents.forEach((inc) => {
			threatDistribution[inc.threatLevel]++;
		});

		return {
			activeIncidents: incidents.filter((inc) => !inc.resolved).length,
			blockedIPs: this.blockedIPs.size,
			throttledIPs: this.throttledIPs.size,
			totalIncidents: incidents.length,
			rateLimitEntries: this.rateLimitStore.size,
			threatLevelDistribution: threatDistribution
		};
	}

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

	unblockIP(ip: string): boolean {
		if (this.blockedIPs.has(ip)) {
			this.blockedIPs.delete(ip);
			this.throttledIPs.delete(ip);
			logger.info('IP manually unblocked', { ip });
			return true;
		}
		return false;
	}

	// ========================================================================
	// CLEANUP
	// ========================================================================

	private cleanupOldIncidents(): void {
		const now = Date.now();
		const maxAge = 24 * 60 * 60 * 1000;

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

		// Clean up old alert timestamps
		for (const [ip, time] of this.lastAlertTime.entries()) {
			if (now - time > this.ALERT_COOLDOWN * 10) {
				this.lastAlertTime.delete(ip);
			}
		}

		logger.trace('Security cleanup completed');
	}

	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const globalWithSecurity = globalThis as typeof globalThis & {
	__SVELTY_SECURITY_RESPONSE_INSTANCE__?: SecurityResponseService;
	__SVELTY_SECURITY_CLEANUP_REGISTERED__?: boolean;
};

if (globalWithSecurity.__SVELTY_SECURITY_RESPONSE_INSTANCE__) {
	globalWithSecurity.__SVELTY_SECURITY_RESPONSE_INSTANCE__.destroy();
}

export const securityResponseService = (() => {
	if (!globalWithSecurity.__SVELTY_SECURITY_RESPONSE_INSTANCE__) {
		globalWithSecurity.__SVELTY_SECURITY_RESPONSE_INSTANCE__ = new SecurityResponseService();
	}
	return globalWithSecurity.__SVELTY_SECURITY_RESPONSE_INSTANCE__;
})();

export const cleanupSecurityService = (): void => {
	securityResponseService.destroy();
};

if (!(building || globalWithSecurity.__SVELTY_SECURITY_CLEANUP_REGISTERED__)) {
	process.on('SIGTERM', cleanupSecurityService);
	process.on('SIGINT', cleanupSecurityService);
	globalWithSecurity.__SVELTY_SECURITY_CLEANUP_REGISTERED__ = true;
}
