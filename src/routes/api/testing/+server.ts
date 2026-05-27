/**
 * @file src/routes/api/testing/+server.ts
 * @description Test Orchestration Endpoint - ONLY FOR TESTING
 * Allows the test runner to reset DB, seed data, and create users via HTTP.
 * STRICTLY GUARDED by TEST_MODE environment variable.
 */

import { json, type RequestEvent } from '@sveltejs/kit';

// Security Guard
function checkTestMode() {
	if (process.env.TEST_MODE !== 'true') {
		throw new Error('FORBIDDEN: Test endpoints only available in TEST_MODE');
	}
}

export async function POST({ request }: RequestEvent) {
	try {
		checkTestMode();

		// In TEST_MODE, the middleware (handleSystemState) bypasses initialization.
		// We must ensure the database is initialized before proceeding.
		// We use reinitializeSystem(true) to force a reload of the private.test.ts file
		// which might have just been created by the setup wizard.
		const { dbAdapter: initialDb, auth: initialAuth, reinitializeSystem } = await import('@src/databases/db');

		if (!initialDb || !initialAuth) {
			console.log('[API/Testing] Database not initialized. Attempting re-initialization...');
			await reinitializeSystem(true);
		}

		// Re-import after initialization (module-level `dbAdapter` may have been reassigned)
		const db = await import('@src/databases/db');
		const currentDbAdapter = db.dbAdapter;
		const currentAuth = db.auth;

		if (!(currentDbAdapter && currentAuth)) {
			return json({ error: 'Database or Auth not initialized after init attempt' }, { status: 503 });
		}

		const body = await request.json();
		const action = body.action;

		switch (action) {
			case 'reset':
				await currentDbAdapter.clearDatabase();
				// Invalidate setup cache so the server realizes the DB is now empty
				const { invalidateSetupCache } = await import('@src/utils/setup-check');
				invalidateSetupCache(true);
				return json({ success: true, message: 'Database cleared' });

			case 'seed': {
				// Initialize default roles, settings and themes
				const { seedRoles, seedDefaultTheme, seedSettings } = await import('@src/routes/setup/seed');

				await seedSettings(currentDbAdapter);
				await seedDefaultTheme(currentDbAdapter);
				await seedRoles(currentDbAdapter);

				// Seed Admin User
				const adminEmail = body.email || 'admin@test.com';
				const adminPassword = body.password || 'Test123!';

				// Check if already exists
				const existing = await currentAuth.getUserByEmail({ email: adminEmail });
				if (!existing) {
					await currentAuth.createUser({
						email: adminEmail,
						password: adminPassword,
						username: 'admin',
						role: 'admin'
					});
				}

				// Invalidate setup cache so the server recognizes the system is now setup
				const { invalidateSetupCache: invalidateAfterSeed } = await import('@src/utils/setup-check');
				invalidateAfterSeed(true);

				return json({ success: true, message: 'Database seeded' });
			}

			case 'create-user': {
				const { email, password, username, role } = body;
				if (!(email && password && role)) {
					return json({ error: 'Missing fields' }, { status: 400 });
				}
				const user = await currentAuth.createUser({
					email,
					password,
					username: username || email.split('@')[0],
					role
				});
				return json({
					success: true,
					user: { id: user._id, email: user.email, role: user.role }
				});
			}

			case 'get-user': {
				const { email } = body;
				const user = await currentAuth.getUserByEmail({ email });
				return json({ success: true, user: user ? { id: user._id, email: user.email, role: user.role, roleIds: (user as any).roleIds } : null });
			}

			case 'reset-roles': {
				const { getDefaultRoles } = await import('@src/databases/auth/default-roles');
				const { invalidateRolesCache } = await import('@src/hooks/handle-authorization');

				const defaults = getDefaultRoles();

				const existingRoles = await currentDbAdapter.auth.getAllRoles();
				const existingIds = new Set(existingRoles.map((r) => r._id));

				const results: Array<{ id: string; isAdmin: boolean; status: string }> = [];
				for (const role of defaults) {
					if (existingIds.has(role._id)) {
						await currentDbAdapter.auth.updateRole(role._id, role);
						results.push({ id: role._id, isAdmin: !!role.isAdmin, status: 'updated' });
					} else {
						await currentDbAdapter.auth.createRole(role);
						results.push({ id: role._id, isAdmin: !!role.isAdmin, status: 'created' });
					}
				}

				invalidateRolesCache();
				// Read back to confirm
				const afterRoles = await currentDbAdapter.auth.getAllRoles();
				const summary = afterRoles.map((r) => ({ id: r._id, isAdmin: r.isAdmin }));
				return json({ success: true, message: 'Roles reset to defaults', results, after: summary });
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
