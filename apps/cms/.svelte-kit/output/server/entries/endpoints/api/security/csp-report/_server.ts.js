import { json } from '@sveltejs/kit';
import { m as metricsService } from '../../../../../chunks/MetricsService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { dev } from '../../../../../chunks/index3.js';
function isValidCSPReport(data) {
	if (!data || typeof data !== 'object') return false;
	const report = data['csp-report'];
	if (!report || typeof report !== 'object') return false;
	return (
		typeof report['document-uri'] === 'string' && typeof report['violated-directive'] === 'string' && typeof report['original-policy'] === 'string'
	);
}
function shouldIgnoreViolation(report) {
	const blockedUri = report['blocked-uri'] || '';
	const violatedDirective = report['violated-directive'] || '';
	if (blockedUri.startsWith('chrome-extension://') || blockedUri.startsWith('moz-extension://') || blockedUri.startsWith('safari-web-extension://')) {
		return true;
	}
	if (blockedUri === 'eval' && violatedDirective.includes('script-src')) {
		return false;
	}
	if (blockedUri.startsWith('data:') && violatedDirective.includes('img-src')) {
		return true;
	}
	return false;
}
const POST = async ({ request, getClientAddress }) => {
	try {
		const clientIp = getClientAddress();
		const contentType = request.headers.get('content-type') || '';
		let reportData;
		if (contentType.includes('application/csp-report')) {
			reportData = await request.json();
		} else if (contentType.includes('application/reports+json')) {
			const reports = await request.json();
			if (Array.isArray(reports) && reports.length > 0) {
				reportData = { 'csp-report': reports[0].body };
			}
		} else {
			logger.warn(`CSP report with unexpected content-type: ${contentType}`);
			return json({ error: 'Invalid content type' }, { status: 400 });
		}
		if (!isValidCSPReport(reportData)) {
			logger.warn('Invalid CSP report format received', { data: reportData });
			return json({ error: 'Invalid report format' }, { status: 400 });
		}
		const report = reportData['csp-report'];
		if (shouldIgnoreViolation(report)) {
			logger.trace(`Ignoring CSP violation: ${report['violated-directive']} - ${report['blocked-uri']}`);
			return json({ status: 'ignored' }, { status: 200 });
		}
		const logLevel = dev ? 'debug' : 'warn';
		logger[logLevel]('CSP Violation Report', {
			documentUri: report['document-uri'],
			violatedDirective: report['violated-directive'],
			effectiveDirective: report['effective-directive'],
			blockedUri: report['blocked-uri'],
			sourceFile: report['source-file'],
			lineNumber: report['line-number'],
			columnNumber: report['column-number'],
			scriptSample: report['script-sample']?.substring(0, 100),
			// Truncate for logging
			disposition: report.disposition,
			clientIp,
			userAgent: request.headers.get('user-agent')?.substring(0, 200)
		});
		metricsService.incrementCSPViolations();
		if (!dev) {
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
			}
		}
		return json({ status: 'received' }, { status: 200 });
	} catch (error) {
		logger.error('Error processing CSP report:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
const OPTIONS = async () => {
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
export { OPTIONS, POST };
//# sourceMappingURL=_server.ts.js.map
