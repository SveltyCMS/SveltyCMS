/**
 * @file scripts/seed-test-users.ts
 * @description Creates additional test users AFTER setup wizard completes
 *
 * This script is called in CI/CD after the setup wizard creates the admin user.
 * It creates developer and editor users for role-based access control testing.
 *
 * Roles (per docs/architecture/admin-user-management.mdx):
 * - admin: Full system access (created by setup wizard)
 * - developer: Development tools, APIs, and system configuration
 * - editor: Content management and media only
 */

import '../tests/bun/setup'; // Mock SvelteKit environment

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4173';
const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

// Admin credentials (created by setup wizard)
const ADMIN_CREDENTIALS = {
	email: process.env.ADMIN_EMAIL || 'admin@example.com',
	password: process.env.ADMIN_PASS || 'Admin123!'
};

// Additional test users (based on admin-user-management.mdx)
const TEST_USERS = {
	developer: {
		username: 'developer',
		email: 'developer@example.com',
		password: 'Developer123!',
		confirmPassword: 'Developer123!',
		role: 'developer' // Has API access + system config, no user management
	},
	editor: {
		username: 'editor',
		email: 'editor@example.com',
		password: 'Editor123!',
		confirmPassword: 'Editor123!',
		role: 'editor' // Content management only, no settings
	}
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
	console.log('⏳ Waiting for server to be ready...');
	for (let i = 0; i < MAX_RETRIES; i++) {
		if (await checkServer()) {
			console.log('✅ Server is ready');
			return true;
		}
		await wait(RETRY_DELAY);
	}
	throw new Error('Server did not start in time');
}

async function loginAsAdmin() {
	console.log('🔐 Logging in as admin...');

	const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: API_BASE_URL },
		body: JSON.stringify(ADMIN_CREDENTIALS)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Admin login failed (${response.status}): ${errorText}`);
	}

	const sessionCookie = response.headers.get('set-cookie');
	if (!sessionCookie) {
		throw new Error('No session cookie received from login');
	}

	console.log('✅ Admin login successful');
	return sessionCookie;
}

async function createUserViaInvitation(user: (typeof TEST_USERS)['developer'], sessionCookie: string) {
	console.log(`🧑 Creating ${user.role}: ${user.username}...`);

	// Step 1: Create invitation token (per admin-user-management.mdx)
	console.log(`  📧 Creating invitation token for ${user.email}...`);
	const inviteResponse = await fetch(`${API_BASE_URL}/api/auth/invite`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: API_BASE_URL,
			Cookie: sessionCookie
		},
		body: JSON.stringify({
			email: user.email,
			username: user.username,
			role: user.role,
			expires: '7d'
		})
	});

	if (!inviteResponse.ok) {
		const error = await inviteResponse.text();

		// If user or token already exists, try direct user creation
		if (error.includes('already exists') || inviteResponse.status === 409) {
			console.log(`  ⚠️  Invitation exists, trying direct user creation...`);
			return await createUserDirectly(user, sessionCookie);
		}

		throw new Error(`Failed to create invitation for ${user.username}: ${error}`);
	}

	const inviteData = await inviteResponse.json();
	const token = inviteData.token;

	if (!token) {
		console.log(`  ⚠️  No token in response, trying direct user creation...`);
		return await createUserDirectly(user, sessionCookie);
	}

	// Step 2: Register using invitation token
	console.log(`  ✍️  Registering user with invitation token...`);
	const registerResponse = await fetch(`${API_BASE_URL}/api/auth/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: API_BASE_URL },
		body: JSON.stringify({
			token,
			password: user.password,
			confirmPassword: user.confirmPassword
		})
	});

	if (!registerResponse.ok) {
		const error = await registerResponse.text();
		if (error.includes('already exists') || registerResponse.status === 409) {
			console.log(`  ✅ User ${user.username} already exists - skipping`);
			return;
		}
		throw new Error(`Failed to register ${user.username}: ${error}`);
	}

	console.log(`✅ Created ${user.role}: ${user.username}`);
}

async function createUserDirectly(user: (typeof TEST_USERS)['developer'], sessionCookie: string) {
	console.log(`  🔧 Attempting direct user creation for ${user.username}...`);

	const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: API_BASE_URL,
			Cookie: sessionCookie
		},
		body: JSON.stringify(user)
	});

	if (!response.ok) {
		const error = await response.text();
		if (error.includes('already exists') || response.status === 409) {
			console.log(`  ✅ User ${user.username} already exists - skipping`);
			return;
		}
		throw new Error(`Failed to create ${user.username} directly: ${error}`);
	}

	console.log(`✅ Created ${user.role}: ${user.username} (direct)`);
}

async function main() {
	try {
		console.log('🌱 SveltyCMS Test User Seeding Script');
		console.log('=====================================\n');

		// Wait for server
		await waitForServer();

		console.log('\n📋 Test Users to Create:');
		console.log(`  - Developer: ${TEST_USERS.developer.email}`);
		console.log(`  - Editor: ${TEST_USERS.editor.email}\n`);

		// Login as admin
		const sessionCookie = await loginAsAdmin();
		console.log('');

		// Create test users
		await createUserViaInvitation(TEST_USERS.developer, sessionCookie);
		await createUserViaInvitation(TEST_USERS.editor, sessionCookie);

		console.log('\n✅ All test users seeded successfully!\n');
		process.exit(0);
	} catch (error) {
		console.error('\n❌ Failed to seed test users:', error);
		console.error('\nStack trace:', error instanceof Error ? error.stack : 'N/A');
		process.exit(1);
	}
}

main();
