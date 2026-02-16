/**
 * @file src/routes/api/testing/+server.ts
 * @description Test Orchestration Endpoint - ONLY FOR TESTING
 * Allows the test runner to reset DB, seed data, and create users via HTTP.
 * STRICTLY GUARDED by TEST_MODE environment variable.
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { dbAdapter, auth } from '@src/databases/db';

// Security Guard
function checkTestMode() {
	if (process.env.TEST_MODE !== 'true') {
		throw new Error('FORBIDDEN: Test endpoints only available in TEST_MODE');
	}
}

export async function POST({ request }: RequestEvent) {
	try {
		checkTestMode();

		if (!dbAdapter || !auth) {
			return json({ error: 'Database or Auth not initialized' }, { status: 503 });
		}

		const body = await request.json();
		const action = body.action;

		switch (action) {
			case 'reset':
				await dbAdapter.clearDatabase();
				return json({ success: true, message: 'Database cleared' });

			case 'seed': {
				// Initialize default roles and permissions
				if (dbAdapter.ensureAuth) await dbAdapter.ensureAuth();
				if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();

				// Seed Admin User
				const adminEmail = body.email || 'admin@example.com';
				const adminPassword = body.password || 'password123';

				// Check if already exists
				const existing = await auth.getUserByEmail({ email: adminEmail });
				if (!existing) {
					await auth.createUser({
						email: adminEmail,
						password: adminPassword,
						username: 'admin',
						role: 'admin'
					});
				}

				return json({ success: true, message: 'Database seeded' });
			}

			case 'create-user': {
				const { email, password, username, role } = body;
				if (!email || !password || !role) {
					return json({ error: 'Missing fields' }, { status: 400 });
				}
				const user = await auth.createUser({ email, password, username: username || email.split('@')[0], role });
				return json({ success: true, user: { id: user._id, email: user.email, role: user.role } });
			}

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error: any) {
		if (error.message.startsWith('FORBIDDEN')) {
			return json({ error: error.message }, { status: 403 });
		}
		console.error('[API/Testing] Error:', error);
		return json({ error: error.message || 'Internal Error' }, { status: 500 });
	}
}
