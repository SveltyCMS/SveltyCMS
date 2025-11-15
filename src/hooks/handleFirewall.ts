/**
 * @file src/hooks/handleFirewall.ts
 * @description Minimal application-level firewall middleware for threat detection
 *
 * ### Purpose
 * Focuses on application-specific threats that infrastructure (Nginx/CDN) cannot detect:
 * - Business logic abuse patterns
 * - Advanced bot detection (headless browsers, automation tools)
 * - Suspicious parameter patterns in requests
 * - Application-level credential stuffing attempts
 *
 * ### What This DOES NOT Do
 * - ❌ SQL injection detection (handled by Nginx/parameterized queries)
 * - ❌ Path traversal blocking (handled by Nginx/static middleware)
 * - ❌ Basic bot filtering (handled by Nginx/CDN)
 * - ❌ Rate limiting (handled by handleRateLimit)
 *
 * ### Performance
 * - Minimal overhead (~1-2ms per request)
 * - Only checks patterns Nginx can't detect
 * - Early exit for legitimate traffic
 * - Complements infrastructure-level security
 *
 * ### Prerequisites
 * - handleSystemState confirmed system is operational
 * - Static assets already filtered by handleStaticAssetCaching
 * - Rate limiting already applied by handleRateLimit
 *
 * @prerequisite Runs after rate limiting, before authentication
 */

import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { metricsService } from '@src/services/MetricsService';
import { logger } from '@utils/logger.server';

// --- THREAT DETECTION PATTERNS ---

/**
 * Application-specific threat patterns that Nginx can't easily detect.
 * Focus on business logic abuse and suspicious parameter usage.
 */
const APP_THREAT_PATTERNS = [
	// Suspicious parameter patterns (credentials in URL)
	/[?&](password|token|secret|api_key|auth)=[^&]*/i,

	// Bulk operations abuse
	/\/api\/(users|content|collections)\/bulk-(delete|update|create)/i,

	// Administrative endpoint enumeration
	/\/(admin|manage|control-panel|dashboard)\/[^/]*\/(delete|remove|destroy)/i,

	// Known malicious payloads in paths
	/<script[^>]*>|javascript:\s*|data:text\/html|vbscript:/i,

	// Template injection attempts
	/\{\{.*\}\}|\${.*}|<%.*%>/i,

	// Command injection patterns
	/;(\s)*(ls|cat|wget|curl|nc|bash|sh|cmd|powershell)/i
];

/**
 * Advanced bot detection patterns.
 * These are automation tools that might bypass basic CDN detection.
 */
const ADVANCED_BOT_PATTERNS = [/HeadlessChrome/i, /PhantomJS/i, /Selenium/i, /Puppeteer/i, /WebDriver/i, /Playwright/i, /Nightmare/i, /ZombieJS/i];

/**
 * Legitimate bot patterns that should NOT be blocked.
 * These are search engines and social media crawlers.
 */
const LEGITIMATE_BOT_PATTERNS = [
	/Googlebot/i,
	/Bingbot/i,
	/Slurp/i, // Yahoo
	/DuckDuckBot/i,
	/Baiduspider/i,
	/YandexBot/i,
	/facebookexternalhit/i,
	/LinkedInBot/i,
	/Twitterbot/i,
	/WhatsApp/i,
	/TelegramBot/i,
	/Discordbot/i
];

// --- UTILITY FUNCTIONS ---

/**
 * Checks if a user agent represents a legitimate bot.
 * @param userAgent - The User-Agent header value
 * @returns True if the bot is legitimate (search engines, social media)
 */
function isLegitimateBot(userAgent: string): boolean {
	return LEGITIMATE_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Checks if a user agent represents an advanced bot or automation tool.
 * @param userAgent - The User-Agent header value
 * @returns True if advanced bot patterns are detected
 */
function isAdvancedBot(userAgent: string): boolean {
	return ADVANCED_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Checks if the request contains application-level threat patterns.
 * @param pathname - The URL pathname
 * @param search - The URL search parameters
 * @returns True if threat patterns are detected
 */
function hasApplicationThreat(pathname: string, search: string): boolean {
	const fullPath = pathname + search;
	return APP_THREAT_PATTERNS.some((pattern) => pattern.test(fullPath));
}

/**
 * Checks if the request has suspicious patterns that might indicate abuse.
 * @param pathname - The URL pathname
 * @returns True if suspicious patterns are detected
 */
function hasSuspiciousPattern(pathname: string): boolean {
	// Check for excessive path depth (possible enumeration)
	const pathDepth = pathname.split('/').filter(Boolean).length;
	if (pathDepth > 10) {
		return true;
	}

	// Check for suspicious file operations
	if (pathname.includes('/../') || pathname.includes('/./')) {
		return true;
	}

	// Check for encoded bypasses
	if (pathname.includes('%2e%2e') || pathname.includes('%252e')) {
		return true;
	}

	return false;
}

// --- MAIN HOOK ---

export const handleFirewall: Handle = async ({ event, resolve }) => {
	const { request, url } = event;
	const userAgent = request.headers.get('user-agent') || '';
	const pathname = url.pathname.toLowerCase();
	const search = url.search.toLowerCase();

	// --- 1. Advanced Bot Detection ---
	// Block automation tools but allow legitimate search engine crawlers
	if (isAdvancedBot(userAgent) && !isLegitimateBot(userAgent)) {
		metricsService.incrementSecurityViolations();
		logger.warn(`Advanced bot detected and blocked: UA=${userAgent.substring(0, 50)}, Path=${pathname}`);
		throw error(403, 'Forbidden: Automated access detected');
	}

	// --- 2. Application-Level Threat Detection ---
	// Check for patterns that Nginx can't detect (business logic abuse)
	if (hasApplicationThreat(pathname, search)) {
		metricsService.incrementSecurityViolations();
		logger.warn(`Application threat detected: IP=${event.getClientAddress()}, ` + `Path=${pathname}, ` + `UA=${userAgent.substring(0, 50)}`);
		throw error(403, 'Forbidden: Request pattern not allowed');
	}

	// --- 3. Suspicious Pattern Detection ---
	// Check for indicators of enumeration or abuse attempts
	if (hasSuspiciousPattern(pathname)) {
		metricsService.incrementSecurityViolations();
		logger.warn(`Suspicious pattern detected: IP=${event.getClientAddress()}, Path=${pathname}`);
		throw error(403, 'Forbidden: Invalid request pattern');
	}

	// --- 4. Request Passed All Checks ---
	return resolve(event);
};

// --- UTILITY EXPORTS ---

/**
 * Export detection functions for use in other hooks or API routes.
 */
export { isLegitimateBot, isAdvancedBot, hasApplicationThreat, hasSuspiciousPattern };
