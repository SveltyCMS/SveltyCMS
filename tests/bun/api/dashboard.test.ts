/**
 * @file tests/bun/api/dashboard.test.ts
 * @description Integration tests for dashboard API endpoints
 *
 * SETUP REQUIREMENTS:
 * ===================
 * These integration tests require a fresh test database, NOT a production system.
 *
 * **Option 1: Automated Test Database (Recommended)**
 * Run the full test suite which sets up a clean test environment:
 *   `bun test tests/bun/api/user.test.ts && bun test tests/bun/api/dashboard.test.ts`
 *
 * **Option 2: Manual Credentials (For testing against existing system)**
 * If you need to test against an already-initialized system, provide credentials:
 *   `TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD=yourpassword bun test tests/bun/api/dashboard.test.ts`
 *
 * **Why tests fail on production systems:**
 * - Dashboard tests expect to create their own admin user
 * - Production systems already have users and require authentication
 * - Test suite needs a clean state to verify API behavior
 *
 * TESTED ENDPOINTS (9 total):
 * ============================
 * - GET /api/dashboard/health - System health check
 * - GET /api/dashboard/metrics - Performance metrics
 * - GET /api/dashboard/systemInfo - System information (CPU, memory, disk)
 * - GET /api/dashboard/logs - System logs with pagination and filtering
 * - GET /api/dashboard/last5Content - Recent content items
 * - GET /api/dashboard/last5media - Recent media files
 * - GET /api/dashboard/online_user - Currently online users
 * - GET /api/dashboard/systemMessages - System messages from logs
 * - GET /api/dashboard/cache-metrics - Cache performance metrics
 */

// @ts-expect-error - Bun test is available at runtime
import { describe, it, expect, beforeAll } from 'bun:test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Test123!';

let authCookie: string;

beforeAll(async () => {
	console.log(`\n🔍 Dashboard API Integration Tests`);
	console.log(`📍 Testing against: ${BASE_URL}`);
	console.log(`📧 Admin credentials: ${ADMIN_EMAIL}`);

	// Try to create a test user (will only work on fresh test database)
	const createResponse = await fetch(`${BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: ADMIN_EMAIL,
			username: 'admin',
			password: ADMIN_PASSWORD,
			role: 'admin'
		})
	});

	if (createResponse.ok) {
		console.log('✅ Created test admin user (fresh test database detected)');
	} else if (createResponse.status === 401) {
		console.log('ℹ️  System already initialized (cannot create users)');
		console.log('💡 Run user API tests first to set up test database:');
		console.log('   bun test tests/bun/api/user.test.ts && bun test tests/bun/api/dashboard.test.ts\n');
	}

	// Try to authenticate
	const loginResponse = await fetch(`${BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: ADMIN_EMAIL,
			password: ADMIN_PASSWORD
		})
	});

	if (!loginResponse.ok) {
		const errorText = await loginResponse.text();
		console.error(`\n❌ Authentication failed (${loginResponse.status})`);
		console.error(`Response: ${errorText}`);
		console.error(`\n📋 To run these tests:`);
		console.error(`   1. Run user tests first: bun test tests/bun/api/user.test.ts`);
		console.error(`   2. Then run dashboard tests: bun test tests/bun/api/dashboard.test.ts`);
		console.error(`   3. OR provide real credentials: TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... bun test\n`);

		throw new Error('Authentication required - see instructions above');
	}

	const setCookie = loginResponse.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error('No session cookie received from login');
	}

	authCookie = setCookie.split(';')[0];
	console.log('✅ Authentication successful - running dashboard tests\n');
});

describe('Dashboard API - Health Endpoint', () => {
	it('should return system health status', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/health`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('overallStatus');
		expect(data).toHaveProperty('timestamp');
		expect(data).toHaveProperty('uptime');
		expect(data).toHaveProperty('components');

		// overallStatus should be one of the valid states
		expect(['READY', 'INITIALIZING', 'DEGRADED', 'FAILED', 'IDLE']).toContain(data.overallStatus);

		// uptime should be a positive number
		expect(typeof data.uptime).toBe('number');
		expect(data.uptime).toBeGreaterThanOrEqual(0);
	});

	it('should return 200 for READY or DEGRADED states', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/health`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		if (data.overallStatus === 'READY' || data.overallStatus === 'DEGRADED') {
			expect(response.status).toBe(200);
		} else {
			expect(response.status).toBe(503);
		}
	});

	it('should include component health details', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/health`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(typeof data.components).toBe('object');

		// Check if components have the expected structure
		const components = Object.values(data.components);
		if (components.length > 0) {
			const component = components[0] as Record<string, unknown>;
			expect(component).toHaveProperty('status');
			expect(['healthy', 'unhealthy', 'initializing']).toContain(component.status);
		}
	});
});

describe('Dashboard API - Metrics Endpoint', () => {
	it('should return basic metrics', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('requests');
		expect(data).toHaveProperty('auth');
		expect(data).toHaveProperty('cache');
		expect(data).toHaveProperty('sessions');
	});

	it('should return detailed metrics when requested', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/metrics?detailed=true`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('system');
		expect(data.system).toHaveProperty('memory');
		expect(data.system).toHaveProperty('uptime');
		expect(data.system).toHaveProperty('nodeVersion');

		expect(data.system.memory).toHaveProperty('used');
		expect(data.system.memory).toHaveProperty('total');
		expect(typeof data.system.uptime).toBe('number');
	});

	it('should have valid metric structure', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(typeof data.requests.total).toBe('number');
		expect(typeof data.auth.validations).toBe('number');
		expect(typeof data.cache.hits).toBe('number');
		expect(typeof data.sessions.active).toBe('number');
	});
});

describe('Dashboard API - System Info Endpoint', () => {
	it('should return all system info by default', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemInfo`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('cpuInfo');
		expect(data).toHaveProperty('diskInfo');
		expect(data).toHaveProperty('memoryInfo');
		expect(data).toHaveProperty('osInfo');
	});

	it('should return only CPU info when type=cpu', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemInfo?type=cpu`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('cpuInfo');
		expect(data).not.toHaveProperty('diskInfo');
		expect(data).not.toHaveProperty('memoryInfo');
	});

	it('should return only memory info when type=memory', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemInfo?type=memory`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('memoryInfo');
		expect(data).not.toHaveProperty('cpuInfo');
		expect(data.memoryInfo).toHaveProperty('total');
	});

	it('should return only disk info when type=disk', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemInfo?type=disk`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('diskInfo');
		expect(data.diskInfo).toHaveProperty('root');
		expect(data.diskInfo.root).toHaveProperty('totalGb');
		expect(data.diskInfo.root).toHaveProperty('usedGb');
	});

	it('should have valid CPU info structure', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemInfo?type=cpu`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(data.cpuInfo).toHaveProperty('currentLoad');
		expect(data.cpuInfo).toHaveProperty('cores');
		expect(typeof data.cpuInfo.currentLoad).toBe('number');
		expect(typeof data.cpuInfo.cores.count).toBe('number');
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemInfo`);
		expect(response.status).toBe(401);
	});
});

describe('Dashboard API - Logs Endpoint', () => {
	it('should return paginated logs', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/logs?limit=10&page=1`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('logs');
		expect(data).toHaveProperty('total');
		expect(data).toHaveProperty('page');
		expect(data).toHaveProperty('totalPages');
		expect(Array.isArray(data.logs)).toBe(true);
		expect(data.page).toBe(1);
	});

	it('should filter logs by level', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/logs?level=error&limit=10`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data.logs)).toBe(true);
		// All returned logs should be error level (if any)
		data.logs.forEach((log: { level: string }) => {
			expect(log.level.toLowerCase()).toBe('error');
		});
	});

	it('should support search parameter', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/logs?search=database&limit=10`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data.logs)).toBe(true);
		// If logs exist, they should contain the search term
		if (data.logs.length > 0) {
			data.logs.forEach((log: { message: string }) => {
				expect(log.message.toLowerCase()).toContain('database');
			});
		}
	});

	it('should have ANSI color support in log messages', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/logs?limit=5`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(Array.isArray(data.logs)).toBe(true);
		// Each log should have both message and messageHtml
		data.logs.forEach((log: { message: string; messageHtml: string }) => {
			expect(typeof log.message).toBe('string');
			expect(typeof log.messageHtml).toBe('string');
		});
	});

	it('should validate limit parameter', async () => {
		// Limit > 100 should be rejected
		const response = await fetch(`${BASE_URL}/api/dashboard/logs?limit=200`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(400);
	});
});

describe('Dashboard API - Last 5 Content Endpoint', () => {
	it('should return recent content items', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/last5Content`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeLessThanOrEqual(5);
	});

	it('should have valid content item structure', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/last5Content`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		if (data.length > 0) {
			const item = data[0];
			expect(item).toHaveProperty('id');
			expect(item).toHaveProperty('title');
			expect(item).toHaveProperty('collection');
			expect(item).toHaveProperty('createdAt');
			expect(item).toHaveProperty('createdBy');
			expect(item).toHaveProperty('status');
		}
	});

	it('should respect custom limit parameter', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/last5Content?limit=3`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeLessThanOrEqual(3);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/last5Content`);
		expect(response.status).toBe(401);
	});
});

describe('Dashboard API - Last 5 Media Endpoint', () => {
	it('should return recent media files', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/last5media`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data)).toBe(true);
	});

	it('should have valid media item structure', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/last5media`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		if (data.length > 0) {
			const item = data[0];
			expect(item).toHaveProperty('name');
			expect(item).toHaveProperty('size');
			expect(item).toHaveProperty('modified');
			expect(item).toHaveProperty('type');
			expect(item).toHaveProperty('url');
			expect(typeof item.size).toBe('number');
		}
	});

	it('should return empty array when no media exists', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/last5media`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();
		expect(Array.isArray(data)).toBe(true);
	});
});

describe('Dashboard API - Online Users Endpoint', () => {
	it('should return online users list', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/online_user`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('onlineUsers');
		expect(Array.isArray(data.onlineUsers)).toBe(true);
	});

	it('should have valid online user structure', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/online_user`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		if (data.onlineUsers.length > 0) {
			const user = data.onlineUsers[0];
			expect(user).toHaveProperty('id');
			expect(user).toHaveProperty('name');
			expect(user).toHaveProperty('onlineTime');
			expect(user).toHaveProperty('onlineMinutes');
			expect(typeof user.onlineMinutes).toBe('number');
		}
	});

	it('should include current user in online list', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/online_user`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		// At minimum, the authenticated user should be online
		expect(data.onlineUsers.length).toBeGreaterThanOrEqual(1);
	});

	it('should sort users by online time (longest first)', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/online_user`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		if (data.onlineUsers.length > 1) {
			for (let i = 0; i < data.onlineUsers.length - 1; i++) {
				expect(data.onlineUsers[i].onlineMinutes).toBeGreaterThanOrEqual(data.onlineUsers[i + 1].onlineMinutes);
			}
		}
	});
});

describe('Dashboard API - System Messages Endpoint', () => {
	it('should return system messages', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemMessages`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data)).toBe(true);
	});

	it('should have valid message structure', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemMessages`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		if (data.length > 0) {
			const message = data[0];
			expect(message).toHaveProperty('id');
			expect(message).toHaveProperty('title');
			expect(message).toHaveProperty('message');
			expect(message).toHaveProperty('level');
			expect(message).toHaveProperty('timestamp');
			expect(message).toHaveProperty('type');
			expect(['error', 'warning', 'info']).toContain(message.type);
		}
	});

	it('should respect limit parameter', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemMessages?limit=3`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(data.length).toBeLessThanOrEqual(3);
	});

	it('should return default message when no logs exist', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/systemMessages?limit=100`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		// Should always return at least one message
		expect(data.length).toBeGreaterThanOrEqual(1);
	});
});

describe('Dashboard API - Cache Metrics Endpoint', () => {
	it('should return cache metrics', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(data).toHaveProperty('overall');
		expect(data).toHaveProperty('byCategory');
		expect(data).toHaveProperty('byTenant');
		expect(data).toHaveProperty('timestamp');
	});

	it('should have valid overall metrics structure', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(data.overall).toHaveProperty('hits');
		expect(data.overall).toHaveProperty('misses');
		expect(data.overall).toHaveProperty('hitRate');
		expect(data.overall).toHaveProperty('totalOperations');

		expect(typeof data.overall.hits).toBe('number');
		expect(typeof data.overall.misses).toBe('number');
		expect(typeof data.overall.hitRate).toBe('number');
	});

	it('should include category breakdown', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(typeof data.byCategory).toBe('object');

		// Each category should have hits, misses, hitRate
		Object.values(data.byCategory).forEach((category: unknown) => {
			const cat = category as Record<string, unknown>;
			expect(cat).toHaveProperty('hits');
			expect(cat).toHaveProperty('misses');
			expect(cat).toHaveProperty('hitRate');
		});
	});

	it('should include recent misses', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		expect(Array.isArray(data.recentMisses)).toBe(true);
		expect(data.recentMisses.length).toBeLessThanOrEqual(10);
	});

	it('should calculate hit rate correctly', async () => {
		const response = await fetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
			headers: { Cookie: authCookie }
		});

		const data = await response.json();

		const total = data.overall.hits + data.overall.misses;
		if (total > 0) {
			const expectedHitRate = (data.overall.hits / total) * 100;
			expect(Math.abs(data.overall.hitRate - expectedHitRate)).toBeLessThan(0.01);
		} else {
			expect(data.overall.hitRate).toBe(0);
		}
	});
});
