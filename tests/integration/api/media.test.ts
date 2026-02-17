/**
 * @file tests/bun/api/media.test.ts
 * @description
 * Integration tests for all media-related API endpoints.
 * Tests focus on authentication, authorization, and request validation.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { cleanupTestDatabase, prepareAuthenticatedContext } from '../helpers/testSetup';

const API_BASE_URL = getApiBaseUrl();

// Minimal valid 1x1 PNG image (89 bytes)
const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createValidPngBlob(): Blob {
	const binaryString = atob(VALID_PNG_BASE64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return new Blob([bytes], { type: 'image/png' });
}

describe('Media API Endpoints', () => {
	let authCookie: string;

	beforeAll(async () => {
		await waitForServer();
	});

	afterAll(async () => {
		await cleanupTestDatabase();
	});

	// Before each test, get a fresh admin session
	beforeEach(async () => {
		authCookie = await prepareAuthenticatedContext();
	});

	describe('GET /api/media/exists', () => {
		it('should return exists:false for non-existent file', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/exists?url=non-existent-file.jpg`, {
				headers: { Cookie: authCookie }
			});
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toHaveProperty('exists');
			expect(data.exists).toBe(false);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/exists?url=test-image.jpg`);
			expect(response.status).toBe(401);
		});

		it('should return 400 with missing URL parameter', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/exists`, {
				headers: { Cookie: authCookie }
			});
			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/media/process', () => {
		it('should extract metadata from valid image', async () => {
			const formData = new FormData();
			formData.append('processType', 'metadata');
			formData.append('file', createValidPngBlob(), 'test.png');

			const response = await fetch(`${API_BASE_URL}/api/media/process`, {
				method: 'POST',
				headers: { Cookie: authCookie, Origin: API_BASE_URL },
				body: formData
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
		});

		it('should return 400 with missing processType', async () => {
			const formData = new FormData();
			const response = await fetch(`${API_BASE_URL}/api/media/process`, {
				method: 'POST',
				headers: { Cookie: authCookie, Origin: API_BASE_URL },
				body: formData
			});
			expect(response.status).toBe(400);
		});

		it('should return 400 with missing file for metadata extraction', async () => {
			const formData = new FormData();
			formData.append('processType', 'metadata');
			const response = await fetch(`${API_BASE_URL}/api/media/process`, {
				method: 'POST',
				headers: { Cookie: authCookie, Origin: API_BASE_URL },
				body: formData
			});
			expect(response.status).toBe(400);
		});

		it('should fail without authentication', async () => {
			const formData = new FormData();
			formData.append('processType', 'metadata');
			const response = await fetch(`${API_BASE_URL}/api/media/process`, {
				method: 'POST',
				headers: { Origin: API_BASE_URL },
				body: formData
			});
			expect(response.status).toBe(401);
		});
	});

	describe('DELETE /api/media/delete', () => {
		it('should return 400 with missing URL', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/delete`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({})
			});
			expect(response.status).toBe(400);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/delete`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'test.jpg' })
			});
			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/media/trash', () => {
		it('should return 400 with missing parameters', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/trash`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({})
			});
			expect(response.status).toBe(400);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/trash`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'test.jpg', contentTypes: ['image/jpeg'] })
			});
			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/user/saveAvatar', () => {
		it('should save avatar with valid image', async () => {
			const formData = new FormData();
			formData.append('avatar', createValidPngBlob(), 'avatar.png');

			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookie, Origin: API_BASE_URL },
				body: formData
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
			expect(data).toHaveProperty('avatarUrl');
		});

		it('should return 400 with missing avatar file', async () => {
			const formData = new FormData();
			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookie, Origin: API_BASE_URL },
				body: formData
			});
			expect(response.status).toBe(400);
		});

		it('should fail without authentication', async () => {
			const formData = new FormData();
			formData.append('avatar', createValidPngBlob(), 'avatar.png');
			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Origin: API_BASE_URL },
				body: formData
			});
			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/media/manipulate/[id]', () => {
		it('should return 401 without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/manipulate/test-id`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ manipulations: {} })
			});
			expect(response.status).toBe(401);
		});

		it('should return 400 with missing manipulations', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/manipulate/test-id`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({})
			});
			expect(response.status).toBe(400);
		});

		it('should return 404 for non-existent media', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/manipulate/non-existent-id`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({ manipulations: { rotation: 90 } })
			});
			// Should be 404 since the media ID doesn't exist
			expect(response.status).toBe(404);
		});
	});

	describe('GET /api/media/remote', () => {
		it('should require authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/remote?url=https://example.com/image.jpg`);
			expect(response.status).toBe(401);
		});
	});
});
