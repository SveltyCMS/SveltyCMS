/**
 * @file scripts/seed-test-db.ts
 * @description Seeds the test database for integration and E2E tests
 *
 * CURRENT: MongoDB only
 * FUTURE: Will support parallel testing with multiple databases:
 *   - MongoDB (current)
 *   - PostgreSQL (via Drizzle ORM)
 *   - MariaDB (via Drizzle ORM)
 *   - MySQL (via Drizzle ORM)
 *
 * The DB_TYPE environment variable will determine which database to seed.
 * GitHub Actions will run tests in parallel matrix for each database type.
 */
import { spawn } from 'child_process';
import { safeParse } from 'valibot';
import '../tests/bun/setup'; // Mock SvelteKit environment

// Import types and schemas from the application source of truth
import { databaseConfigSchema, type DatabaseConfig } from '../src/databases/schemas';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4173';
const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

// Test Configuration - Typed against the application schema
// Safety check: Ensure we are running in a test environment
const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
const dbName = process.env.DB_NAME || 'sveltycms_test';

if (!isTestMode && !dbName.includes('test')) {
	console.error('❌ SAFETY ERROR: Attempting to seed a non-test database without TEST_MODE enabled.');
	console.error('   Current DB_NAME:', dbName);
	console.error('   Please set TEST_MODE=true or use a database name containing "test".');
	process.exit(1);
}

const testDbConfig: DatabaseConfig = {
	type: (process.env.DB_TYPE as 'mongodb' | 'mongodb+srv') || 'mongodb',
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT || '27017'),
	name: dbName,
	user: process.env.DB_USER || '',
	password: process.env.DB_PASSWORD || ''
};

// Validate config against the schema before even trying to send it
const validationResult = safeParse(databaseConfigSchema, testDbConfig);
if (!validationResult.success) {
	console.error('❌ Invalid Test Database Configuration:', validationResult.issues);
	process.exit(1);
}

const testAdminUser = {
	username: 'admin',
	email: 'admin@example.com',
	password: 'Admin123!',
	confirmPassword: 'Admin123!'
};

async function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkServer() {
	try {
		const res = await fetch(API_BASE_URL);
		return res.ok || res.status === 404; // 404 is fine for root
	} catch (e) {
		return false;
	}
}

async function waitForServer() {
	console.log('Waiting for server...');
	for (let i = 0; i < MAX_RETRIES; i++) {
		if (await checkServer()) {
			console.log('✓ Server is ready');
			return true;
		}
		await wait(RETRY_DELAY);
	}
	throw new Error('Server did not start in time');
}

async function seedDatabase() {
	console.log('Seeding database...');

	// 1. Seed Configuration
	console.log('1. Seeding configuration...');
	const seedRes = await fetch(`${API_BASE_URL}/api/setup/seed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(testDbConfig)
	});

	if (!seedRes.ok) {
		const err = await seedRes.text();
		// If already seeded, that's fine
		if (err.includes('already exists') || err.includes('setup already completed') || seedRes.status === 409) {
			console.log('⚠ Configuration already exists, skipping seed.');
		} else {
			throw new Error(`Failed to seed configuration: ${err}`);
		}
	} else {
		console.log('✓ Configuration seeded');

		// Wait for server restart if needed (in dev mode, Vite might restart)
		await wait(2000);
		await waitForServer();
	}

	// 2. Complete Setup (Create Admin)
	console.log('2. Creating admin user...');
	const completeRes = await fetch(`${API_BASE_URL}/api/setup/complete`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			admin: testAdminUser,
			skipWelcomeEmail: true
		})
	});

	if (!completeRes.ok) {
		const err = await completeRes.text();
		if (err.includes('already completed') || completeRes.status === 400) {
			console.log('⚠ Setup already completed, skipping admin creation.');
		} else {
			throw new Error(`Failed to create admin user: ${err}`);
		}
	} else {
		console.log('✓ Admin user created');
	}

	console.log('✓ Database seeding complete');
}

async function main() {
	try {
		await waitForServer();
		await seedDatabase();
		process.exit(0);
	} catch (error) {
		console.error('❌ Seeding failed:', error);
		process.exit(1);
	}
}

main();
