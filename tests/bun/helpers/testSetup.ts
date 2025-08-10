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
export async function cleanupTestEnvironment(): Promise<void> {}
export async function cleanupTestDatabase(): Promise<void> {}

export const testFixtures = {
	users: {
		firstAdmin: {
			email: 'admin@test.com',
			username: 'admin',
			password: 'Test123!',
			confirm_password: 'Test123!',
			firstName: 'Admin',
			lastName: 'User',
			role: 'admin',
			isAdmin: true,
			permissions: ['system:admin', 'admin:access']
		},
		secondUser: {
			email: 'user2@test.com',
			username: 'user2',
			password: 'Test123!',
			confirm_password: 'Test123!',
			firstName: 'Second',
			lastName: 'User',
			role: 'editor'
		}
	}
};
