// Minimal test setup: wait for the running CMS and expose a few fixtures.
// CI ensures Mongo is fresh; we don't touch the DB here.

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

async function waitForServer(timeoutMs = 60000, intervalMs = 1000): Promise<void> {
	const start = Date.now();
	let lastError: unknown;
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(API_BASE_URL, { method: 'GET' });
			if (res.ok) return;
			lastError = new Error(`Server responded ${res.status}`);
		} catch (e) {
			lastError = e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	throw new Error(`CMS did not become ready at ${API_BASE_URL} within ${timeoutMs}ms. Last error: ${String(lastError)}`);
}

export async function initializeTestEnvironment(): Promise<void> {
	await waitForServer();
}

export async function cleanupTestEnvironment(): Promise<void> {
	// Cleanup can be implemented if needed
}

export async function cleanupTestDatabase(): Promise<void> {
	// Database cleanup handled by CI/test infrastructure
}

// --- ROLE ID RESOLUTION ---
const cachedRoleIds: Record<string, string> = {};

/**
 * Get a role ID by role name, with caching for performance
 * Falls back to the role name string if API doesn't exist or fails
 */
export async function getRoleId(roleName: string): Promise<string> {
	if (cachedRoleIds[roleName]) {
		return cachedRoleIds[roleName];
	}

	try {
		// Try to fetch roles from API
		const response = await fetch(`${API_BASE_URL}/api/roles`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		});

		if (response.ok) {
			const result = await response.json();
			const roles = result.data || result;

			if (Array.isArray(roles)) {
				// Cache all role IDs
				roles.forEach((role: { name: string; _id: string }) => {
					if (role.name && role._id) {
						cachedRoleIds[role.name] = role._id;
					}
				});

				// Return the requested role ID
				if (cachedRoleIds[roleName]) {
					return cachedRoleIds[roleName];
				}
			}
		}
	} catch (error) {
		console.warn(`Failed to fetch role ID for '${roleName}', using string fallback:`, error);
	}

	// Fallback: return the role name string
	// This works for initial setup when roles might be created dynamically
	cachedRoleIds[roleName] = roleName;
	return roleName;
}

/**
 * Check if this is the first user scenario (no users in database)
 */
export async function isFirstUser(): Promise<boolean> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/admin/users?limit=1`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		});

		if (response.ok) {
			const result = await response.json();
			return !result.data || result.data.length === 0;
		}
	} catch {
		// If API doesn't exist or fails, assume it's first user
		console.warn('Could not check user count, assuming first user scenario');
	}
	return true;
}

/**
 * Get dynamic test fixtures with resolved role IDs
 */
export async function getTestFixtures() {
	const adminRoleId = await getRoleId('admin');
	const editorRoleId = await getRoleId('editor');

	return {
		users: {
			firstAdmin: {
				email: 'admin@test.com',
				username: 'admin',
				password: 'Test123!',
				role: adminRoleId
			},
			secondUser: {
				email: 'user2@test.com',
				username: 'user2',
				password: 'Test123!',
				role: editorRoleId
			}
		}
	};
}

// Static test fixtures for backward compatibility (uses string role names)
export const testFixtures = {
	users: {
		firstAdmin: {
			email: 'admin@test.com',
			username: 'admin',
			password: 'Test123!',
			role: 'admin'
		},
		secondUser: {
			email: 'user2@test.com',
			username: 'user2',
			password: 'Test123!',
			role: 'editor'
		}
	}
};

/**
 * Helper to create an admin user and return auth token
 */
export async function loginAsAdminAndGetToken(): Promise<string> {
	// 1. Create the admin user
	const createResponse = await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(testFixtures.users.firstAdmin)
	});

	if (!createResponse.ok) {
		throw new Error(`Failed to create admin user: ${createResponse.status}`);
	}

	// 2. Log in as the admin user
	const loginResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testFixtures.users.firstAdmin.email,
			password: testFixtures.users.firstAdmin.password
		})
	});

	if (!loginResponse.ok) {
		throw new Error(`Failed to login as admin: ${loginResponse.status}`);
	}

	// 3. Extract and return the session cookie
	const setCookieHeader = loginResponse.headers.get('set-cookie');
	if (!setCookieHeader) {
		throw new Error('No session cookie returned from login');
	}

	return setCookieHeader;
}
