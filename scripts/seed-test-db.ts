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
import { safeParse } from 'valibot';
// import '../tests/bun/setup'; // Mock SvelteKit environment - REMOVED: Incompatible with bun run, handled via tsconfig paths

// Import types and schemas from the application source of truth
import { privateEnv } from '../config/private.test'; // Import dedicated test config

// Import types and schemas from the application source of truth
import { databaseConfigSchema, type DatabaseConfig } from '../src/databases/schemas';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4173';
const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

// Test Configuration - Typed against the application schema
// Safety check: Ensure we are running in a test environment
const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
// Prefer DB_NAME from privateEnv if available
const dbName = privateEnv?.DB_NAME || process.env.DB_NAME || 'sveltycms_test';

if (!isTestMode && !dbName.includes('test')) {
	console.error('❌ SAFETY ERROR: Attempting to seed a non-test database without TEST_MODE enabled.');
	console.error('   Current DB_NAME:', dbName);
	console.error('   Please set TEST_MODE=true or use a database name containing "test".');
	process.exit(1);
}

const testDbConfig: DatabaseConfig = {
	type: (privateEnv?.DB_TYPE as 'mongodb' | 'mongodb+srv') || (process.env.DB_TYPE as 'mongodb' | 'mongodb+srv') || 'mongodb',
	host: privateEnv?.DB_HOST || process.env.DB_HOST || 'localhost',
	port: privateEnv?.DB_PORT || parseInt(process.env.DB_PORT || '27017'),
	name: dbName,
	user: privateEnv?.DB_USER || process.env.DB_USER || '',
	password: privateEnv?.DB_PASSWORD || process.env.DB_PASSWORD || ''
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
		// Use redirect: 'manual' to avoid "too many redirects" errors during setup
		const res = await fetch(`${API_BASE_URL}/api/system/version`, { redirect: 'manual' });
		// Accept 200, 302/307 (setup redirect means server is running), or 404
		return res.ok || res.status === 302 || res.status === 307 || res.status === 404;
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
		headers: { 'Content-Type': 'application/json', Origin: API_BASE_URL },
		body: JSON.stringify(testDbConfig)
	});

	if (!seedRes.ok) {
		const err = await seedRes.text();
		// If already seeded, that's fine - but we still need to ensure data is seeded
		if (err.includes('already exists') || err.includes('setup already completed') || seedRes.status === 409) {
			console.log('⚠ Configuration already exists - checking if data needs seeding...');

			// Even though config exists, we need to seed roles/settings/themes
			// Call the seed endpoint again with a flag to force data seeding
			// For now, we'll just log and continue - roles should be created by /api/setup/complete
			console.log('ℹ️  Continuing to admin user creation...');
		} else {
			throw new Error(`Failed to seed configuration: ${err}`);
		}
	} else {
		const responseData = await seedRes.json();
		console.log('✓ Configuration seeded');
		console.log(`  API Response: ${JSON.stringify(responseData)}`);
		if (responseData.rolesCreated !== undefined) {
			console.log(`  ✓ API reports ${responseData.rolesCreated} roles created`);
		}

		// Wait for server restart if needed (in dev mode, Vite might restart)
		await wait(2000);
		await waitForServer();

		// Verify roles were created by directly checking MongoDB
		console.log('🔍 Verifying roles were created in database...');
		try {
			const { MongoClient } = await import('mongodb');
			const mongoUri = `mongodb://${testDbConfig.user}:${testDbConfig.password}@${testDbConfig.host}:${testDbConfig.port}`;
			const client = new MongoClient(mongoUri);
			await client.connect();
			const db = client.db(testDbConfig.name);
			const roles = await db.collection('roles').find({}).toArray();
			console.log(`✓ Found ${roles.length} roles in database after seeding`);
			if (roles.length === 0) {
				console.error('❌ WARNING: Seeding reported success but no roles found!');
			} else {
				console.log(`✓ Role names: ${roles.map((r: any) => r.name).join(', ')}`);
			}
			await client.close();
		} catch (error) {
			console.error('❌ Failed to verify roles:', error);
		}
	}

	// 2. Complete Setup (Create Admin)
	console.log('2. Creating admin user...');
	const completeRes = await fetch(`${API_BASE_URL}/api/setup/complete`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: API_BASE_URL },
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
