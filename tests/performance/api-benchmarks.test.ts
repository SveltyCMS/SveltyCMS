/**
 * @file tests/performance/api-benchmarks.test.ts
 * @description Performance benchmark tests for API endpoints
 * 
 * These tests ensure that API endpoints respond within acceptable time limits.
 * Benchmarks help detect performance regressions before they reach production.
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../bun/helpers/server';
import { loginAsAdmin } from '../bun/helpers/auth';

const API_BASE_URL = getApiBaseUrl();
const RESPONSE_TIME_THRESHOLD = 500; // 500ms threshold for API responses
const FAST_RESPONSE_THRESHOLD = 100; // 100ms threshold for lightweight endpoints

describe('API Performance Benchmarks', () => {
let adminCookie: string;

beforeAll(async () => {
await waitForServer();
try {
adminCookie = await loginAsAdmin();
} catch (e) {
// If login fails, tests will skip auth
console.warn('Admin login failed, some benchmarks may be skipped');
}
});

it('GET /api/systemInfo should respond within 100ms', async () => {
const start = Date.now();
const response = await fetch(`${API_BASE_URL}/api/systemInfo`, {
headers: adminCookie ? { Cookie: adminCookie } : {}
});
const duration = Date.now() - start;

expect(response.ok).toBe(true);
expect(duration).toBeLessThan(FAST_RESPONSE_THRESHOLD);
});

it('GET /api/collections should respond within 500ms', async () => {
const start = Date.now();
const response = await fetch(`${API_BASE_URL}/api/collections`, {
headers: adminCookie ? { Cookie: adminCookie } : {}
});
const duration = Date.now() - start;

if (response.ok) {
expect(duration).toBeLessThan(RESPONSE_TIME_THRESHOLD);
}
});

it('POST /api/user/login should respond within 500ms', async () => {
const start = Date.now();
const response = await fetch(`${API_BASE_URL}/api/user/login`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
email: 'admin@example.com',
password: 'Admin123!'
})
});
const duration = Date.now() - start;

if (response.status < 500) {
expect(duration).toBeLessThan(RESPONSE_TIME_THRESHOLD);
}
});

it('GET /health should respond within 50ms', async () => {
const start = Date.now();
const response = await fetch(`${API_BASE_URL}/health`);
const duration = Date.now() - start;

// Health check should be very fast
expect(duration).toBeLessThan(50);
});
});

describe('Database Query Performance', () => {
let adminCookie: string;

beforeAll(async () => {
await waitForServer();
try {
adminCookie = await loginAsAdmin();
} catch (e) {
console.warn('Admin login failed, database benchmarks may be skipped');
}
});

it('Collection list query should respond within 300ms', async () => {
if (!adminCookie) {
console.log('Skipping: No admin cookie');
return;
}

const start = Date.now();
const response = await fetch(`${API_BASE_URL}/api/collections`, {
headers: { Cookie: adminCookie }
});
const duration = Date.now() - start;

if (response.ok) {
expect(duration).toBeLessThan(300);
}
});
});

/**
 * Usage in CI/CD:
 * 
 * These benchmarks can be used to:
 * 1. Detect performance regressions in PRs
 * 2. Track performance trends over time
 * 3. Ensure SLA compliance (e.g., 95% of requests < 500ms)
 * 
 * To run: `bun test tests/performance/api-benchmarks.test.ts`
 */
