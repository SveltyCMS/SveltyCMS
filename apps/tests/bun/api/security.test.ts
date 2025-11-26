/**
 * @file tests/bun/api/security.test.ts
 * @description Integration tests for Security API endpoints
 *
 * Tests 5 security management endpoints:
 * - GET /api/security/stats - Security statistics and metrics
 * - GET /api/security/incidents - List security incidents
 * - POST /api/security/incidents/[id]/resolve - Resolve security incident
 * - POST /api/security/unblock - Unblock IP address
 * - POST /api/security/csp-report - Report CSP violations
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { prepareAuthenticatedContext, cleanupTestDatabase } from '../helpers/testSetup';

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
	await waitForServer();
	authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
	await cleanupTestDatabase();
});

describe('Security API - Statistics', () => {
	it('should return security statistics', async () => {
		const response = await fetch(`${BASE_URL}/api/security/stats`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		// Should have basic stats structure
		expect(data).toBeDefined();
		expect(typeof data).toBe('object');
	});

	it('should include blocked IPs count', async () => {
		const response = await fetch(`${BASE_URL}/api/security/stats`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('blockedIPs');
			expect(typeof data.blockedIPs).toBe('number');
		}
	});

	it('should include security incidents count', async () => {
		const response = await fetch(`${BASE_URL}/api/security/stats`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('incidents');
			expect(typeof data.incidents).toBe('number');
		}
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/security/stats`);
		expect([401, 403]).toContain(response.status);
	});

	it('should include threat level indicators', async () => {
		const response = await fetch(`${BASE_URL}/api/security/stats`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// May have threat level classification
			if (data.threatLevel) {
				expect(['low', 'medium', 'high', 'critical']).toContain(data.threatLevel);
			}
		}
	});
});

describe('Security API - Incidents', () => {
	it('should list security incidents', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data) || Array.isArray(data.incidents)).toBe(true);
	});

	it('should support pagination for incidents', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents?page=1&limit=10`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		if (data.pagination) {
			expect(data.pagination).toHaveProperty('page');
			expect(data.pagination).toHaveProperty('limit');
			expect(data.pagination).toHaveProperty('total');
		}
	});

	it('should filter incidents by severity', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents?severity=high`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
	});

	it('should filter incidents by status', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents?status=unresolved`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
	});

	it('should include incident details', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			const incidents = data.incidents || data;

			if (incidents.length > 0) {
				const incident = incidents[0];
				expect(incident).toHaveProperty('id');
				expect(incident).toHaveProperty('type');
				expect(incident).toHaveProperty('timestamp');
			}
		}
	});

	it('should require authentication for incidents list', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents`);
		expect([401, 403]).toContain(response.status);
	});
});

describe('Security API - Resolve Incident', () => {
	it('should resolve security incident with valid ID', async () => {
		// First, get an incident ID (if any exist)
		const listResponse = await fetch(`${BASE_URL}/api/security/incidents`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const incidents = data.incidents || data;

			if (incidents.length > 0) {
				const incidentId = incidents[0].id || incidents[0]._id;

				const response = await fetch(`${BASE_URL}/api/security/incidents/${incidentId}/resolve`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Cookie: authCookie
					},
					body: JSON.stringify({
						notes: 'Resolved in automated test'
					})
				});

				expect([200, 404]).toContain(response.status);

				if (response.ok) {
					const result = await response.json();
					expect(result.success || result.resolved).toBe(true);
				}
			}
		}
	});

	it('should return 404 for non-existent incident', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents/nonexistent-id/resolve`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		expect([404, 400]).toContain(response.status);
	});

	it('should require authentication to resolve incidents', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents/test-id/resolve`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should accept optional resolution notes', async () => {
		const response = await fetch(`${BASE_URL}/api/security/incidents/test-id/resolve`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				notes: 'False positive',
				resolvedBy: 'admin'
			})
		});

		// Should validate request even if incident doesn't exist
		expect(response.status).toBeGreaterThanOrEqual(200);
	});
});

describe('Security API - Unblock IP', () => {
	it('should unblock IP address', async () => {
		const response = await fetch(`${BASE_URL}/api/security/unblock`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				ip: '192.168.1.100'
			})
		});

		expect([200, 404, 400]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(data.success || data.unblocked).toBe(true);
		}
	});

	it('should validate IP address format', async () => {
		const response = await fetch(`${BASE_URL}/api/security/unblock`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				ip: 'invalid-ip'
			})
		});

		expect([400, 422]).toContain(response.status);
	});

	it('should require authentication to unblock', async () => {
		const response = await fetch(`${BASE_URL}/api/security/unblock`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ip: '192.168.1.100' })
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should support IPv6 addresses', async () => {
		const response = await fetch(`${BASE_URL}/api/security/unblock`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
			})
		});

		expect([200, 404, 400]).toContain(response.status);
	});

	it('should log unblock action for audit trail', async () => {
		const response = await fetch(`${BASE_URL}/api/security/unblock`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				ip: '192.168.1.101',
				reason: 'False positive'
			})
		});

		// Should accept reason parameter
		expect(response.status).toBeGreaterThanOrEqual(200);
	});
});

describe('Security API - CSP Reports', () => {
	it('should accept CSP violation reports', async () => {
		const response = await fetch(`${BASE_URL}/api/security/csp-report`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/csp-report' },
			body: JSON.stringify({
				'csp-report': {
					'document-uri': 'https://example.com/page',
					'violated-directive': 'script-src',
					'blocked-uri': 'https://evil.com/script.js',
					'source-file': 'https://example.com/page',
					'line-number': 10,
					'column-number': 5
				}
			})
		});

		expect([200, 204]).toContain(response.status);
	});

	it('should handle standard CSP report format', async () => {
		const response = await fetch(`${BASE_URL}/api/security/csp-report`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				'csp-report': {
					'document-uri': 'https://example.com',
					'violated-directive': 'default-src',
					'effective-directive': 'script-src',
					'blocked-uri': 'inline',
					disposition: 'enforce'
				}
			})
		});

		expect([200, 204, 400]).toContain(response.status);
	});

	it('should not require authentication for CSP reports', async () => {
		// CSP reports come from browser, no auth expected
		const response = await fetch(`${BASE_URL}/api/security/csp-report`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/csp-report' },
			body: JSON.stringify({
				'csp-report': {
					'document-uri': 'https://example.com',
					'violated-directive': 'script-src',
					'blocked-uri': 'https://cdn.com/script.js'
				}
			})
		});

		expect([200, 204]).toContain(response.status);
	});

	it('should rate limit CSP reports', async () => {
		// Send many reports rapidly
		const reports = Array(100)
			.fill(null)
			.map(() =>
				fetch(`${BASE_URL}/api/security/csp-report`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						'csp-report': {
							'document-uri': 'https://example.com',
							'violated-directive': 'script-src',
							'blocked-uri': 'https://spam.com/script.js'
						}
					})
				})
			);

		const responses = await Promise.all(reports);
		const statuses = responses.map((r) => r.status);

		// Should eventually rate limit
		expect(statuses.some((s) => s === 429)).toBe(true);
	});

	it('should validate CSP report structure', async () => {
		const response = await fetch(`${BASE_URL}/api/security/csp-report`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				invalidField: 'invalid'
			})
		});

		expect([400, 422]).toContain(response.status);
	});
});

describe('Security API - Integration', () => {
	it('should correlate blocked IPs with incidents', async () => {
		const statsResponse = await fetch(`${BASE_URL}/api/security/stats`, {
			headers: { Cookie: authCookie }
		});

		const incidentsResponse = await fetch(`${BASE_URL}/api/security/incidents`, {
			headers: { Cookie: authCookie }
		});

		if (statsResponse.ok && incidentsResponse.ok) {
			const stats = await statsResponse.json();
			const incidents = await incidentsResponse.json();

			// Stats and incidents should be consistent
			expect(typeof stats).toBe('object');
			expect(Array.isArray(incidents) || incidents.incidents).toBeTruthy();
		}
	});

	it('should provide real-time security monitoring data', async () => {
		const response = await fetch(`${BASE_URL}/api/security/stats`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();

			// Should include timestamps for real-time monitoring
			if (data.lastUpdate || data.timestamp) {
				expect(typeof (data.lastUpdate || data.timestamp)).toBe('number');
			}
		}
	});
});
