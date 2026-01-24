/**
 * @file tests/bun/scripts/seed.ts
 * @description Standalone script to seed the test database before server start.
 * Ensures the server loads with valid settings and roles in cache.
 */

import { MongoClient } from 'mongodb';
import { randomUUID } from 'crypto';

// Load config/private.test.ts like runner does?
// Simplest is to assume standard test env
const DB_NAME = process.env.DB_NAME || 'sveltycms_test';
const MONGO_URI = process.env.MONGODB_URI || `mongodb://admin:Getin1972!@127.0.0.1:27017/${DB_NAME}?authSource=admin`;

// Load hash utility (bun supports typescript via runtime transpilation)
import { hashPassword } from '../../../src/utils/password';

async function seed() {
	console.log(`[SEED] Seeding database: ${DB_NAME}`);
	const client = new MongoClient(MONGO_URI);

	try {
		console.log(`[SEED] Connecting to MongoDB...`);
		await client.connect();
		const db = client.db(DB_NAME);
		console.log(`[SEED] Connected. Using DB: ${db.databaseName}`);

		// 1. Seed Roles
		const adminRole = await db.collection('auth_roles').findOne({ _id: 'admin' });
		console.log(`[SEED] Existing Admin Role found: ${!!adminRole}`);
		if (!adminRole) {
			console.log('[SEED] Creating Admin role...');
			await db.collection('auth_roles').insertOne({
				_id: 'admin',
				name: 'Admin',
				description: 'System Administrator',
				permissions: ['admin', '*', 'system:manage', 'settings:view', 'settings:edit'], // comprehensive list
				isAdmin: true, // Explicit admin flag
				core: true,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		// 2. Seed Settings
		const settingsCount = await db.collection('system_settings').countDocuments();
		if (settingsCount === 0) {
			console.log('[SEED] Creating System Settings...');
			const now = new Date();
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
				// Needed for Export/Import tests
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
			await db.collection('system_settings').insertMany(settings);
		}

		// 3. Seed Users
		const userCount = await db.collection('auth_users').countDocuments();
		if (userCount === 0) {
			console.log('[SEED] Creating Admin User...');
			const passwordHash = await hashPassword('Admin123!');
			await db.collection('auth_users').insertOne({
				_id: randomUUID(),
				email: 'admin@example.com',
				username: 'admin',
				password: passwordHash, // Hashed password
				role: 'admin', // Legacy
				roles: ['admin'], // Modern
				active: true,
				avatar: '',
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		console.log('[SEED] Database seeded successfully.');
	} catch (e) {
		console.error('[SEED] Error seeding:', e);
		process.exit(1);
	} finally {
		await client.close();
		process.exit(0);
	}
}

seed();
