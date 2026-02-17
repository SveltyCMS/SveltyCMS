import { describe, expect, test } from 'bun:test';
import { securityResponseService } from '../../../src/services/SecurityResponseService';

describe('SecurityResponseService', () => {
	// Helper to create a mock Request object that looks like a web Request
	const createMockRequest = (url: string, method = 'GET', headers: Record<string, string> = {}, body = ''): Request => {
		const requestUrl = new URL(`http://localhost${url}`);
		return {
			url: requestUrl.toString(),
			method,
			headers: new Headers(headers),
			clone: () => ({
				text: async () => body
			})
		} as unknown as Request; // Cast to Request type
	};

	describe('XSS Pattern Detection', () => {
		test('should detect simple script tags and return high status', async () => {
			const mockRequest = createMockRequest('/?q=<script>alert(1)</script>');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('high');
			expect(status.action).toBe('challenge');
			expect(status.reason).toContain('Suspicious payload detected');
		});

		test('should detect script tags with attributes and return high status', async () => {
			const mockRequest = createMockRequest('/?q=<script src="http://example.com/xss.js"></script>');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('high');
			expect(status.action).toBe('challenge');
			expect(status.reason).toContain('Suspicious payload detected');
		});

		test('should detect script tags with whitespace in closing tag before the > and return high status', async () => {
			const mockRequest = createMockRequest('/?q=<script>alert(1)</script >');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('high');
			expect(status.action).toBe('challenge');
			expect(status.reason).toContain('Suspicious payload detected');
		});

		test('should detect script tags with newline in closing tag before the > and return high status', async () => {
			const mockRequest = createMockRequest('/?q=<script>alert(1)</script\n>');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('high');
			expect(status.action).toBe('challenge');
			expect(status.reason).toContain('Suspicious payload detected');
		});

		test('should detect script tags with invalid characters in closing tag before the > and return high status', async () => {
			const mockRequest = createMockRequest('/?q=<script>alert(1)</script foo>');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('high');
			expect(status.action).toBe('challenge');
			expect(status.reason).toContain('Suspicious payload detected');
		});

		test('should detect javascript: protocol and return high status', async () => {
			const mockRequest = createMockRequest('/?q=<a href="javascript:alert(1)">');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('high');
			expect(status.action).toBe('challenge');
			expect(status.reason).toContain('Suspicious payload detected');
		});

		test('should detect onload attributes and return high status', async () => {
			const mockRequest = createMockRequest('/?q=<body onload=alert(1)>');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('high');
			expect(status.action).toBe('challenge');
			expect(status.reason).toContain('Suspicious payload detected');
		});

		test('should not have a false positive on regular text and return allow status', async () => {
			const mockRequest = createMockRequest('/?q=this is a test with script and other things');
			const status = await securityResponseService.analyzeRequest(mockRequest, '127.0.0.1');
			expect(status.level).toBe('none');
			expect(status.action).toBe('allow');
		});
	});
});
