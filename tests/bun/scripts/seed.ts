/**
 * @file tests/bun/scripts/seed.ts
 * @description Standalone script to seed the test database before server start.
 * Ensures the server loads with valid settings and roles in cache.
 */

// Environment variables
const DB_TYPE = process.env.DB_TYPE || 'mongodb';
const DB_NAME = process.env.DB_NAME || 'sveltycms_test';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '27017');
const DB_USER = process.env.DB_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

// Load hash utility (bun supports typescript via runtime transpilation)
import { hashPassword } from '../../../src/utils/password';

async function seed() {
	console.log(`[SEED] Seeding database: ${DB_NAME} (${DB_TYPE})`);

	try {
		const { initializeForSetup, dbAdapter } = await import('../../../src/databases/db');
		const setupRes = await initializeForSetup({
			type: DB_TYPE,
			host: DB_HOST,
			port: DB_PORT,
			name: DB_NAME,
			user: DB_USER,
			password: DB_PASSWORD
		});

		if (!setupRes.success) {
			throw new Error(`Failed to initialize DB for seeding: ${setupRes.error}`);
		}

		if (!dbAdapter) {
			throw new Error('Database adapter not available after initialization');
		}

		// 1. Seed Roles
		console.log('[SEED] Checking roles...');
		const rolesRes = await dbAdapter.crud.findOne('auth_roles', { _id: 'admin' } as any);

		if (!rolesRes.success || !rolesRes.data) {
			console.log('[SEED] Creating Admin role...');
			await dbAdapter.crud.insert('auth_roles', {
				_id: 'admin',
				name: 'Admin',
				description: 'System Administrator',
				permissions: ['admin', '*', 'system:manage', 'settings:view', 'settings:edit'],
				isAdmin: true,
				core: true,
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
		}

		// 2. Seed Settings
		console.log('[SEED] Checking system settings...');
		const settingsRes = await dbAdapter.crud.findMany('system_settings', {}, { limit: 1 });
		if (settingsRes.success && (!settingsRes.data || settingsRes.data.length === 0)) {
			console.log('[SEED] Creating System Settings...');
			const now = new Date();
			const { randomUUID } = await import('crypto');
			const settings = [
				{
					_id: randomUUID(),
					key: 'SITE_NAME',
					value: 'SveltyCMS Test',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: randomUUID(),
					key: 'HOST_DEV',
					value: 'http://localhost:4173',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: randomUUID(),
					key: 'DEFAULT_CONTENT_LANGUAGE',
					value: 'en',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: randomUUID(),
					key: 'DEFAULT_THEME_IS_DEFAULT',
					value: true,
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: randomUUID(),
					key: 'MEDIA_STORAGE_TYPE',
					value: 'local',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: randomUUID(),
					key: 'HOST_PROD',
					value: 'http://localhost:4173',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				}
			];

			for (const setting of settings) {
				await dbAdapter.crud.insert('system_settings', setting as any);
			}
		}

		// 3. Seed Users
		console.log('[SEED] Checking users...');
		const usersRes = await dbAdapter.crud.findMany('auth_users', {}, { limit: 1 });
		if (usersRes.success && (!usersRes.data || usersRes.data.length === 0)) {
			console.log('[SEED] Creating Admin User...');
			const { randomUUID } = await import('crypto');
			const passwordHash = await hashPassword('Admin123!');
			await dbAdapter.crud.insert('auth_users', {
				_id: randomUUID(),
				email: 'admin@example.com',
				username: 'admin',
				password: passwordHash,
				role: 'admin',
				roles: ['admin'],
				active: true,
				avatar: '',
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
		}

		console.log('[SEED] Database seeded successfully.');
	} catch (e: any) {
		console.error('[SEED] Error seeding:', e);
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

seed();
