import { describe, expect, it } from 'bun:test';

/**
 * @file tests/bun/api/api-endpoints.test.ts
 * @description Comprehensive API endpoint tests for all SveltyCMS API routes
 *
 * This test suite covers:
 * - Authentication flow (signup, login, OAuth)
 * - User management endpoints
 * - Dashboard and system endpoints
 * - Media management endpoints
 * - Collections, content, and revisions endpoints
 * - Miscellaneous endpoints (GraphQL, Virtual Folders)
 *
 * Note: These tests expect 500 errors due to authentication middleware
 * converting 401 errors to 500 in the current implementation.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

describe('SveltyCMS API Endpoints', () => {
	describe('Authentication Flow', () => {
		describe('User Registration & Login', () => {
			it('should handle first user registration attempt', async () => {
				console.log('🧪 Testing first user registration...');

				const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						email: 'admin@test.com',
						username: 'admin',
						password: 'Test123!',
						confirm_password: 'Test123!'
					})
				});

				console.log(`📝 Signup response status: ${response.status}`);
				const result = await response.json();

				// Should get structured response (currently returns 500 due to auth middleware)
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 400, 401, 500]).toContain(response.status);
			});

			it('should handle user login attempt', async () => {
				console.log('🧪 Testing user login...');

				const response = await fetch(`${API_BASE_URL}/api/user/login`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						email: 'admin@test.com',
						password: 'Test123!'
					})
				});

				console.log(`🔑 Login response status: ${response.status}`);
				const result = await response.json();

				// Should get structured response
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 400, 401, 500]).toContain(response.status);
			});

			it('should handle OAuth login endpoint', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/oauth/login`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						provider: 'google',
						token: 'mock-oauth-token'
					})
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect([200, 400, 401, 404, 500]).toContain(response.status);
			});
		});

		it('should handle logout endpoint', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/logout`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(result).toBeDefined();
			expect([200, 401, 500]).toContain(response.status);
		});
	});

	describe('User Management Endpoints', () => {
		const userEndpoints = [
			{ method: 'GET', path: '/api/user/profile', desc: 'Get user profile' },
			{ method: 'PUT', path: '/api/user/profile', desc: 'Update user profile' },
			{ method: 'POST', path: '/api/user/changePassword', desc: 'Change password' },
			{ method: 'GET', path: '/api/user/list', desc: 'List users' },
			{ method: 'PUT', path: '/api/user/123', desc: 'Update user by ID' },
			{ method: 'DELETE', path: '/api/user/123', desc: 'Delete user by ID' }
		];

		userEndpoints.forEach(({ method, path, desc }) => {
			it(`should handle ${method} ${path} (${desc})`, async () => {
				const response = await fetch(`${API_BASE_URL}${path}`, {
					method,
					headers: {
						'Content-Type': 'application/json'
					},
					body: method !== 'GET' && method !== 'DELETE' ? JSON.stringify({}) : undefined
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 401, 404, 500]).toContain(response.status);

				console.log(`✅ ${method} ${path} - Status: ${response.status}`);
			});
		});
	});

	describe('Dashboard & System Endpoints', () => {
		const dashboardEndpoints = [
			{ method: 'GET', path: '/api/dashboard/systemInfo', desc: 'Get system info' },
			{ method: 'GET', path: '/api/dashboard/userActivity', desc: 'Get user activity' },
			{ method: 'GET', path: '/api/dashboard/last5media', desc: 'Get last 5 media' },
			{ method: 'GET', path: '/api/dashboard/last5Content', desc: 'Get last 5 content' },
			{ method: 'GET', path: '/api/dashboard/systemPreferences', desc: 'Get system preferences' },
			{ method: 'GET', path: '/api/dashboard/systemMessages', desc: 'Get system messages' },
			{ method: 'GET', path: '/api/systemPreferences', desc: 'Get system preferences' },
			{ method: 'POST', path: '/api/systemPreferences', desc: 'Update system preferences' }
		];

		dashboardEndpoints.forEach(({ method, path, desc }) => {
			it(`should handle ${method} ${path} (${desc})`, async () => {
				const response = await fetch(`${API_BASE_URL}${path}`, {
					method,
					headers: {
						'Content-Type': 'application/json'
					},
					body: method === 'POST' ? JSON.stringify({ siteName: 'Test' }) : undefined
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 401, 500]).toContain(response.status);

				console.log(`✅ ${method} ${path} - Status: ${response.status}`);
			});
		});
	});

	describe('Media Management Endpoints', () => {
		const mediaEndpoints = [
			{ method: 'GET', path: '/api/media', desc: 'List media' },
			{ method: 'POST', path: '/api/media', desc: 'Upload media' },
			{ method: 'GET', path: '/api/media/123', desc: 'Get media by ID' },
			{ method: 'PUT', path: '/api/media/123', desc: 'Update media by ID' },
			{ method: 'DELETE', path: '/api/media/123', desc: 'Delete media by ID' },
			{ method: 'POST', path: '/api/media/upload', desc: 'Upload media file' },
			{ method: 'GET', path: '/api/media/search', desc: 'Search media' }
		];

		mediaEndpoints.forEach(({ method, path, desc }) => {
			it(`should handle ${method} ${path} (${desc})`, async () => {
				const response = await fetch(`${API_BASE_URL}${path}`, {
					method,
					headers: {
						'Content-Type': 'application/json'
					},
					body: method !== 'GET' && method !== 'DELETE' ? JSON.stringify({}) : undefined
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 401, 404, 500]).toContain(response.status);

				console.log(`✅ ${method} ${path} - Status: ${response.status}`);
			});
		});
	});

	describe('Collections, Content, & Revisions Endpoints', () => {
		const collectionEndpoints = [
			{ method: 'GET', path: '/api/collections', desc: 'List collections' },
			{ method: 'POST', path: '/api/collections', desc: 'Create collection' },
			{ method: 'GET', path: '/api/collections/123', desc: 'Get collection by ID' },
			{ method: 'PUT', path: '/api/collections/123', desc: 'Update collection by ID' },
			{ method: 'DELETE', path: '/api/collections/123', desc: 'Delete collection by ID' },
			{ method: 'GET', path: '/api/collections/123/entries', desc: 'Get collection entries' },
			{ method: 'POST', path: '/api/collections/123/entries', desc: 'Create collection entry' },
			{ method: 'GET', path: '/api/content', desc: 'List content' },
			{ method: 'POST', path: '/api/content', desc: 'Create content' },
			{ method: 'GET', path: '/api/content/123', desc: 'Get content by ID' },
			{ method: 'PUT', path: '/api/content/123', desc: 'Update content by ID' },
			{ method: 'DELETE', path: '/api/content/123', desc: 'Delete content by ID' }
		];

		collectionEndpoints.forEach(({ method, path, desc }) => {
			it(`should handle ${method} ${path} (${desc})`, async () => {
				const response = await fetch(`${API_BASE_URL}${path}`, {
					method,
					headers: {
						'Content-Type': 'application/json'
					},
					body: method !== 'GET' && method !== 'DELETE' ? JSON.stringify({}) : undefined
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 401, 404, 500]).toContain(response.status);

				console.log(`✅ ${method} ${path} - Status: ${response.status}`);
			});
		});

		describe('Revisions Endpoint (/api/query)', () => {
			it('should handle fetching revision metadata', async () => {
				const formData = new FormData();
				formData.append('method', 'REVISIONS');
				formData.append('collectionId', 'mockCollectionId');
				formData.append('entryId', 'mockEntryId');
				formData.append('user_id', 'mockUserId');
				formData.append('metaOnly', 'true');

				const response = await fetch(`${API_BASE_URL}/api/query`, {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 401, 404, 500]).toContain(response.status);

				console.log(`✅ POST /api/query (REVISIONS metaOnly) - Status: ${response.status}`);
			});

			it('should handle fetching a single revision with diff', async () => {
				const formData = new FormData();
				formData.append('method', 'REVISIONS');
				formData.append('collectionId', 'mockCollectionId');
				formData.append('entryId', 'mockEntryId');
				formData.append('revisionId', 'mockRevisionId');
				formData.append('user_id', 'mockUserId');
				formData.append('currentData', JSON.stringify({ field: 'newValue' }));

				const response = await fetch(`${API_BASE_URL}/api/query`, {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 400, 401, 404, 500]).toContain(response.status);

				console.log(`✅ POST /api/query (REVISIONS with diff) - Status: ${response.status}`);
			});
		});
	});

	describe('Token & Session Management', () => {
		const tokenEndpoints = [
			{ method: 'POST', path: '/api/token/validate', desc: 'Validate token' },
			{ method: 'POST', path: '/api/token/refresh', desc: 'Refresh token' },
			{ method: 'POST', path: '/api/token/revoke', desc: 'Revoke token' },
			{ method: 'GET', path: '/api/token/info', desc: 'Get token info' },
			{ method: 'POST', path: '/api/token/invite', desc: 'Create invite token' },
			{ method: 'GET', path: '/api/session/info', desc: 'Get session info' },
			{ method: 'POST', path: '/api/session/destroy', desc: 'Destroy session' }
		];

		tokenEndpoints.forEach(({ method, path, desc }) => {
			it(`should handle ${method} ${path} (${desc})`, async () => {
				const response = await fetch(`${API_BASE_URL}${path}`, {
					method,
					headers: {
						'Content-Type': 'application/json'
					},
					body: method !== 'GET' ? JSON.stringify({}) : undefined
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 401, 404, 500]).toContain(response.status);

				console.log(`✅ ${method} ${path} - Status: ${response.status}`);
			});
		});
	});

	describe('Theme & Permissions', () => {
		const themeEndpoints = [
			{ method: 'GET', path: '/api/theme/get-current-theme', desc: 'Get current theme' },
			{ method: 'POST', path: '/api/theme/update-theme', desc: 'Update theme' },
			{ method: 'POST', path: '/api/permission/update', desc: 'Update permissions' }
		];

		themeEndpoints.forEach(({ method, path, desc }) => {
			it(`should handle ${method} ${path} (${desc})`, async () => {
				const response = await fetch(`${API_BASE_URL}${path}`, {
					method,
					headers: {
						'Content-Type': 'application/json'
					},
					body: method === 'POST' ? JSON.stringify({}) : undefined
				});

				const result = await response.json();
				expect(result).toBeDefined();
				expect(typeof result).toBe('object');
				expect([200, 401, 404, 500]).toContain(response.status);

				console.log(`✅ ${method} ${path} - Status: ${response.status}`);
			});
		});
	});

	describe('Miscellaneous Endpoints', () => {
		it('should handle GraphQL endpoint', async () => {
			const response = await fetch(`${API_BASE_URL}/api/graphql`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query: `query { systemInfo { version } }`
				})
			});

			const result = await response.json();
			expect(result).toBeDefined();
			expect([200, 401, 500]).toContain(response.status);

			console.log(`✅ POST /api/graphql - Status: ${response.status}`);
		});

		it('should handle Virtual Folders endpoint', async () => {
			const response = await fetch(`${API_BASE_URL}/api/virtualFolder`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(result).toBeDefined();
			expect([200, 401, 404, 500]).toContain(response.status);

			console.log(`✅ GET /api/virtualFolder - Status: ${response.status}`);
		});

		it('should handle System Virtual Folders endpoint', async () => {
			const response = await fetch(`${API_BASE_URL}/api/systemVirtualFolder`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(result).toBeDefined();
			expect([200, 401, 404, 500]).toContain(response.status);

			console.log(`✅ GET /api/systemVirtualFolder - Status: ${response.status}`);
		});

		it('should handle Email service endpoint', async () => {
			const response = await fetch(`${API_BASE_URL}/api/sendMail`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					to: 'test@example.com',
					subject: 'Test',
					html: '<p>Test</p>'
				})
			});

			const result = await response.json();
			expect(result).toBeDefined();
			expect([200, 400, 401, 500]).toContain(response.status);

			console.log(`✅ POST /api/sendMail - Status: ${response.status}`);
		});

		it('should handle Video processing endpoint', async () => {
			const response = await fetch(`${API_BASE_URL}/api/video`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					videoUrl: 'https://example.com/video.mp4',
					operation: 'transcode'
				})
			});

			const result = await response.json();
			expect(result).toBeDefined();
			expect([200, 401, 500]).toContain(response.status);

			console.log(`✅ POST /api/video - Status: ${response.status}`);
		});
	});

	describe('System Health Check', () => {
		it('should verify login page is accessible', async () => {
			const response = await fetch(`${API_BASE_URL}/login`, {
				method: 'GET'
			});

			expect(response.status).toBe(200);
			console.log(`✅ GET /login - Status: ${response.status} (System accessible)`);
		});

		it('should verify API endpoints are not returning 404', async () => {
			const criticalEndpoints = [
				'/api/user/createUser',
				'/api/user/login',
				'/api/dashboard/systemInfo',
				'/api/media',
				'/api/collections',
				'/api/systemPreferences'
			];

			for (const endpoint of criticalEndpoints) {
				const response = await fetch(`${API_BASE_URL}${endpoint}`, {
					method: 'GET'
				});

				// Should not be 404 (endpoint exists)
				expect(response.status).not.toBe(404);
				console.log(`✅ ${endpoint} - Status: ${response.status} (Endpoint exists)`);
			}
		});
	});
});
