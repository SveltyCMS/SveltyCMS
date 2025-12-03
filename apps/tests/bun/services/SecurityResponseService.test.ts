// tests/bun/services/SecurityResponseService.test.ts
// @ts-expect-error - Bun types are not available in TypeScript
import { expect, test, describe } from 'bun:test';
import { securityResponseService, type ThreatIndicator } from '../../../src/services/SecurityResponseService';

describe('SecurityResponseService', () => {
	describe('XSS Pattern Detection', () => {
		test('should detect simple script tags', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=<script>alert(1)</script>', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(true);
		});

		test('should detect script tags with attributes', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=<script src="http://example.com/xss.js"></script>', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(true);
		});

		test('should detect script tags with whitespace in closing tag before the >', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=<script>alert(1)</script >', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(true);
		});

		test('should detect script tags with newline in closing tag before the >', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=<script>alert(1)</script\n>', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(true);
		});

		test('should detect script tags with invalid characters in closing tag before the >', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=<script>alert(1)</script foo>', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(true);
		});

		test('should detect javascript: protocol', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=<a href="javascript:alert(1)">', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(true);
		});

		test('should detect onload attributes', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=<body onload=alert(1)>', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(true);
		});

		test('should not have a false positive on regular text', () => {
			const indicators = securityResponseService.analyzeRequest('127.0.0.1', 'test-ua', '/?q=this is a test with script and other things', {});
			expect(indicators.some((i: ThreatIndicator) => i.type === 'xss_attempt')).toBe(false);
		});
	});
});
