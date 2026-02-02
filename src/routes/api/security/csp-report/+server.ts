/**
 * @file src/routes/api/security/csp-report/+server.ts
 * @description CSP violation reporting endpoint for security monitoring
 *
 * ### Features
 * - Receives and processes CSP violation reports
 * - Logs violations for security analysis
 * - Tracks violation metrics for monitoring
 * - Rate limits to prevent abuse
 * - Validates report format
 *
 * @security This endpoint helps monitor XSS attempts and policy violations
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { metricsService } from '@src/services/MetricsService';
import { logger } from '@utils/logger.server';
import { dev } from '$app/environment';

// --- TYPES ---

interface CSPViolationReport {
	'document-uri': string;
	referrer: string;
	'violated-directive': string;
	'effective-directive': string;
	'original-policy': string;
	disposition: 'enforce' | 'report';
	'blocked-uri': string;
	'line-number': number;
	'column-number': number;
	'source-file': string;
	'status-code': number;
	'script-sample': string;
}

interface CSPReportPayload {
	'csp-report': CSPViolationReport;
}

// --- VALIDATION ---

/**
 * Validates that the incoming report has the expected CSP format.
 */
function isValidCSPReport(data: unknown): data is CSPReportPayload {
	if (!data || typeof data !== 'object') return false;

	const report = (data as CSPReportPayload)['csp-report'];
	if (!report || typeof report !== 'object') return false;

	// Check for required fields
	return (
		typeof report['document-uri'] === 'string' && typeof report['violated-directive'] === 'string' && typeof report['original-policy'] === 'string'
	);
}

/**
 * Checks if a CSP violation should be ignored (common false positives).
 */
function shouldIgnoreViolation(report: CSPViolationReport): boolean {
	const blockedUri = report['blocked-uri'] || '';
	const violatedDirective = report['violated-directive'] || '';

	// Ignore browser extensions
	if (blockedUri.startsWith('chrome-extension://') || blockedUri.startsWith('moz-extension://') || blockedUri.startsWith('safari-web-extension://')) {
		return true;
	}

	// Ignore common browser artifacts
	if (blockedUri === 'eval' && violatedDirective.includes('script-src')) {
		// This might be legitimate eval() usage - log but don't alarm
		return false;
	}

	// Ignore data URLs for images (commonly used legitimately)
	if (blockedUri.startsWith('data:') && violatedDirective.includes('img-src')) {
		return true;
	}

	return false;
}

// --- HANDLERS ---

/**
 * Handles CSP violation reports sent by browsers.
 */
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';

/**
 * Handles CSP violation reports sent by browsers.
 */
export const POST = apiHandler(async ({ request, getClientAddress }) => {
	try {
		// Rate limiting check (prevent report spam)
		const clientIp = getClientAddress();

		// Parse the violation report
		const contentType = request.headers.get('content-type') || '';
		let reportData: unknown;

		if (contentType.includes('application/csp-report')) {
			// Standard CSP report format
			reportData = await request.json();
		} else if (contentType.includes('application/reports+json')) {
			// Newer Reporting API format
			const reports = await request.json();
			if (Array.isArray(reports) && reports.length > 0) {
				reportData = { 'csp-report': reports[0].body };
			}
		} else {
			logger.warn(`CSP report with unexpected content-type: ${contentType}`);
			return json({ error: 'Invalid content type' }, { status: 400 });
		}

		// Validate report format
		if (!isValidCSPReport(reportData)) {
			logger.warn('Invalid CSP report format received', { data: reportData });
			return json({ error: 'Invalid report format' }, { status: 400 });
		}

		const report = reportData['csp-report'];

		// Check if this violation should be ignored
		if (shouldIgnoreViolation(report)) {
			logger.trace(`Ignoring CSP violation: ${report['violated-directive']} - ${report['blocked-uri']}`);
			return json({ status: 'ignored' }, { status: 200 });
		}

		// Log the violation for analysis
		const logLevel = dev ? 'debug' : 'warn';
		logger[logLevel]('CSP Violation Report', {
			documentUri: report['document-uri'],
			violatedDirective: report['violated-directive'],
			effectiveDirective: report['effective-directive'],
			blockedUri: report['blocked-uri'],
			sourceFile: report['source-file'],
			lineNumber: report['line-number'],
			columnNumber: report['column-number'],
			scriptSample: report['script-sample']?.substring(0, 100), // Truncate for logging
			disposition: report.disposition,
			clientIp,
			userAgent: request.headers.get('user-agent')?.substring(0, 200)
		});

		// Track violation metrics
		metricsService.incrementCSPViolations();

		// In production, you might want to:
		// - Store violations in database for analysis
		// - Send alerts for suspicious patterns
		// - Update CSP policies based on legitimate violations

		if (!dev) {
			// Example: Check for potential XSS attempts
			const suspiciousPatterns = [/javascript:/i, /<script/i, /eval\(/i, /setTimeout\(/i, /setInterval\(/i];

			const blockedContent = report['script-sample'] || report['blocked-uri'] || '';
			const isSuspicious = suspiciousPatterns.some((pattern) => pattern.test(blockedContent));

			if (isSuspicious) {
				logger.error('Suspicious CSP violation detected - potential XSS attempt', {
					blockedUri: report['blocked-uri'],
					scriptSample: report['script-sample'],
					documentUri: report['document-uri'],
					clientIp,
					userAgent: request.headers.get('user-agent')
				});

				// Here you could trigger additional security measures:
				// - Rate limit the client IP
				// - Send security alerts
				// - Log to security monitoring system
			}
		}

		return json({ status: 'received' }, { status: 200 });
	} catch (error) {
		logger.error('Error processing CSP report:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});

/**
 * Handle OPTIONS requests for CORS preflight.
 */
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400'
		}
	});
};
