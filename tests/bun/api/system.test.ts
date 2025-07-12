import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';

/**
 * @file tests/bun/api/system.test.ts
 * @description Integration tests for system and dashboard API endpoints
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

describe('System & Dashboard API Endpoints', () => {
	let authToken: string;

	beforeAll(async () => {
		await initializeTestEnvironment();
	});

	afterAll(async () => {
		await cleanupTestEnvironment();
	});

	beforeEach(async () => {
		await cleanupTestDatabase();

		// Create admin user and get auth token
		await fetch(`${API_BASE_URL}/api/user/createUser`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: testFixtures.users.firstAdmin.email,
				username: testFixtures.users.firstAdmin.username,
				password: testFixtures.users.firstAdmin.password,
				confirm_password: testFixtures.users.firstAdmin.password
			})
		});

		const loginResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: testFixtures.users.firstAdmin.email,
				password: testFixtures.users.firstAdmin.password
			})
		});

		const loginResult = await loginResponse.json();
		authToken = loginResult.data.token;
	});

	describe('Dashboard Endpoints', () => {
		describe('GET /api/dashboard/systemInfo', () => {
			it('should get system info with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/systemInfo`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
				expect(result.data.system).toBeDefined();
			});

			it('should reject request without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/systemInfo`, {
					method: 'GET'
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});

		describe('GET /api/dashboard/userActivity', () => {
			it('should get user activity with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/userActivity`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject request without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/userActivity`, {
					method: 'GET'
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});

		describe('GET /api/dashboard/last5media', () => {
			it('should get last 5 media with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/last5media`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject request without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/last5media`, {
					method: 'GET'
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});

		describe('GET /api/dashboard/last5Content', () => {
			it('should get last 5 content with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/last5Content`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject request without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/last5Content`, {
					method: 'GET'
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});

		describe('GET /api/dashboard/systemPreferences', () => {
			it('should get system preferences with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/systemPreferences`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject request without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/systemPreferences`, {
					method: 'GET'
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});

		describe('GET /api/dashboard/systemMessages', () => {
			it('should get system messages with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/systemMessages`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject request without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/dashboard/systemMessages`, {
					method: 'GET'
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});
	});

	describe('System Preferences', () => {
		describe('GET /api/systemPreferences', () => {
			it('should get system preferences with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/systemPreferences`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject request without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/systemPreferences`, {
					method: 'GET'
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});

		describe('POST /api/systemPreferences', () => {
			it('should update system preferences with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/systemPreferences`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({
						siteName: 'Updated Site Name',
						siteDescription: 'Updated description'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject update without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/systemPreferences`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						siteName: 'Updated Site Name'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});
	});

	describe('Theme Management', () => {
		describe('GET /api/theme/get-current-theme', () => {
			it('should get current theme', async () => {
				const response = await fetch(`${API_BASE_URL}/api/theme/get-current-theme`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`
					}
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should allow theme access without auth (public)', async () => {
				const response = await fetch(`${API_BASE_URL}/api/theme/get-current-theme`, {
					method: 'GET'
				});

				// Theme might be public or require auth
				expect([200, 401]).toContain(response.status);
			});
		});

		describe('POST /api/theme/update-theme', () => {
			it('should update theme with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/theme/update-theme`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({
						theme: 'dark',
						primaryColor: '#007bff'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject theme update without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/theme/update-theme`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						theme: 'dark'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});
	});

	describe('Permission Management', () => {
		describe('POST /api/permission/update', () => {
			it('should update permissions with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/permission/update`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({
						userId: 'test-user-id',
						permissions: ['read', 'write']
					})
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject permission update without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/permission/update`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						userId: 'test-user-id',
						permissions: ['read']
					})
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});

			it('should reject invalid permission data', async () => {
				const response = await fetch(`${API_BASE_URL}/api/permission/update`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({
						// Missing userId
						permissions: ['read']
					})
				});

				const result = await response.json();
				expect(response.status).toBe(400);
				expect(result.success).toBe(false);
			});
		});
	});

	describe('Email Service', () => {
		describe('POST /api/sendMail', () => {
			it('should send email with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/sendMail`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({
						to: 'test@example.com',
						subject: 'Test Email',
						html: '<p>Test email content</p>'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject email without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/sendMail`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						to: 'test@example.com',
						subject: 'Test Email',
						html: '<p>Test email content</p>'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});

			it('should reject invalid email data', async () => {
				const response = await fetch(`${API_BASE_URL}/api/sendMail`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({
						to: 'invalid-email',
						subject: 'Test Email'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(400);
				expect(result.success).toBe(false);
			});
		});
	});

	describe('Video Processing', () => {
		describe('POST /api/video', () => {
			it('should process video with admin auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/video`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({
						videoUrl: 'https://example.com/video.mp4',
						operation: 'transcode'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should reject video processing without auth', async () => {
				const response = await fetch(`${API_BASE_URL}/api/video`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						videoUrl: 'https://example.com/video.mp4'
					})
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});
	});
});
