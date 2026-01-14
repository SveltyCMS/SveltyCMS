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

// Environment Detection
const IS_CI = process.env.CI === 'true';
const SEED_EXTENDED = process.env.SEED_EXTENDED_USERS === 'true' || IS_CI;

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

// Extended test users (only created in CI or when SEED_EXTENDED_USERS=true)
const extendedTestUsers = [
	{
		username: 'editor',
		email: 'editor@example.com',
		password: 'Editor123!',
		confirmPassword: 'Editor123!',
		role: 'editor'
	},
	{
		username: 'viewer',
		email: 'viewer@example.com',
		password: 'Viewer123!',
		confirmPassword: 'Viewer123!',
		role: 'viewer'
	}
];

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
	const mode = SEED_EXTENDED ? 'EXTENDED (CI)' : 'STANDARD (Local)';
	console.log(`\n🌱 Seeding test database [${mode}]...\n`);

	// 1. Seed Configuration
	console.log('1️⃣  Seeding database configuration...');
	const seedRes = await fetch(`${API_BASE_URL}/api/setup/seed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(testDbConfig)
	});

	if (!seedRes.ok) {
		const err = await seedRes.text();
		// If already seeded, that's fine - but we still need to ensure data is seeded
		if (err.includes('already exists') || err.includes('setup already completed') || seedRes.status === 409) {
			console.log('⚠️  Configuration already exists - continuing to user creation...');
		} else {
			throw new Error(`Failed to seed configuration: ${err}`);
		}
	} else {
		const responseData = await seedRes.json();
		console.log('✅ Configuration seeded successfully');
		if (responseData.rolesCreated !== undefined) {
			console.log(`   ✓ Created ${responseData.rolesCreated} default roles (admin, editor, developer)`);
		}

		// Wait for server restart if needed (in dev mode, Vite might restart)
		await wait(2000);
		await waitForServer();

		// Verify roles were created by directly checking MongoDB
		try {
			const { MongoClient } = await import('mongodb');
			const mongoUri = `mongodb://${testDbConfig.user}:${testDbConfig.password}@${testDbConfig.host}:${testDbConfig.port}`;
			const client = new MongoClient(mongoUri);
			await client.connect();
			const db = client.db(testDbConfig.name);
			const roles = await db.collection('roles').find({}).toArray();
			if (roles.length === 0) {
				console.error('❌ WARNING: Seeding reported success but no roles found!');
			}
			await client.close();
		} catch (error) {
			// Silent - don't clutter output with verification errors
		}
	}

	// 2. Complete Setup (Create Admin)
	console.log('\n2️⃣  Creating default admin user...');
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
			console.log('⚠️  Admin user already exists - skipping creation.');
		} else {
			throw new Error(`Failed to create admin user: ${err}`);
		}
	} else {
		console.log('✅ Admin user created successfully');
		console.log(`   Email: ${testAdminUser.email}`);
		console.log(`   Password: ${testAdminUser.password}`);
	}

	// 3. Create Extended Test Users (CI Mode Only)
	if (SEED_EXTENDED) {
		console.log('\n3️⃣  Creating extended test users for CI testing...');
		
		// First, login as admin to get auth cookie
		let adminCookie: string | null = null;
		try {
			const loginFormData = new FormData();
			loginFormData.append('email', testAdminUser.email);
			loginFormData.append('password', testAdminUser.password);
			
			const loginRes = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				body: loginFormData
			});
			
			if (loginRes.ok) {
				adminCookie = loginRes.headers.get('set-cookie');
			}
		} catch (error) {
			console.error('⚠️  Failed to login as admin for user creation');
		}

		// Create extended users
		for (const user of extendedTestUsers) {
			try {
				const userFormData = new FormData();
				userFormData.append('email', user.email);
				userFormData.append('password', user.password);
				userFormData.append('confirmPassword', user.confirmPassword);
				userFormData.append('role', user.role);
				userFormData.append('username', user.username);

				const headers: Record<string, string> = {};
				if (adminCookie) {
					headers['Cookie'] = adminCookie;
				}

				const userRes = await fetch(`${API_BASE_URL}/api/user/createUser`, {
					method: 'POST',
					headers,
					body: userFormData
				});

				if (!userRes.ok) {
					const errText = await userRes.text();
					if (errText.toLowerCase().includes('duplicate') || errText.toLowerCase().includes('exists')) {
						console.log(`   ⚠️  ${user.role} user already exists - skipping`);
					} else {
						console.error(`   ❌ Failed to create ${user.role} user: ${errText.substring(0, 100)}`);
					}
				} else {
					console.log(`   ✅ Created ${user.role} user (${user.email})`);
				}
			} catch (error) {
				console.error(`   ❌ Error creating ${user.role} user:`, error);
			}
		}
	} else {
		console.log('\n3️⃣  Skipping extended users (local mode)');
	}

	console.log('\n✅ Database seeding complete!\n');
	
	// Print summary
	console.log('🎉 Test environment ready!\n');
	console.log('═══════════════════════════════════════════════════════');
	console.log('Available Test Users:');
	console.log('───────────────────────────────────────────────────────');
	console.log(`  👤 Admin:    ${testAdminUser.email} / ${testAdminUser.password}`);
	
	if (SEED_EXTENDED) {
		for (const user of extendedTestUsers) {
			console.log(`  👤 ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}:   ${user.email} / ${user.password}`);
		}
	} else {
		console.log(`  👤 Editor:   editor@example.com / Editor123!    (CI only)`);
		console.log(`  👤 Viewer:   viewer@example.com / Viewer123!    (CI only)`);
		console.log('');
		console.log('  💡 Extended users not created (local mode)');
		console.log('     For full testing, use: SEED_EXTENDED_USERS=true');
	}
	console.log('═══════════════════════════════════════════════════════\n');
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
