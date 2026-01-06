/**
 * @file src/databases/mariadb/seed.ts
 * @description Database seeding functions for MariaDB
 */

import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { DatabaseId } from '../dbInterface';
import { authUsers, roles, themes, systemVirtualFolders } from './schema';
import { generateId, dateToISO } from './utils';
import { logger } from '@utils/logger';

/**
 * Seed initial database with required data
 * Called during setup wizard completion
 */
export async function seedDatabase(
	db: MySql2Database<Record<string, unknown>>,
	adminEmail: string,
	adminPassword: string,
	adminUsername: string
): Promise<{ success: boolean; error?: string }> {
	try {
		logger.info('Starting database seeding...');

		// 1. Create default roles
		const adminRoleId = generateId();
		const userRoleId = generateId();
		const editorRoleId = generateId();

		await db.insert(roles).values([
			{
				_id: adminRoleId,
				name: 'Admin',
				description: 'Full system access',
				permissions: ['*'],
				isAdmin: true,
				icon: 'mdi:shield-account',
				color: 'red',
				createdAt: new Date(),
				updatedAt: new Date()
			},
			{
				_id: editorRoleId,
				name: 'Editor',
				description: 'Content management access',
				permissions: ['content.read', 'content.write', 'content.update', 'media.read', 'media.upload'],
				isAdmin: false,
				icon: 'mdi:pencil',
				color: 'blue',
				createdAt: new Date(),
				updatedAt: new Date()
			},
			{
				_id: userRoleId,
				name: 'User',
				description: 'Basic user access',
				permissions: ['content.read'],
				isAdmin: false,
				icon: 'mdi:account',
				color: 'green',
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);

		logger.info('✅ Default roles created');

		// 2. Create admin user
		const adminUserId = generateId();
		await db.insert(authUsers).values({
			_id: adminUserId,
			email: adminEmail,
			username: adminUsername,
			password: adminPassword, // Should already be hashed by caller
			emailVerified: true,
			blocked: false,
			roleIds: [adminRoleId],
			createdAt: new Date(),
			updatedAt: new Date()
		});

		logger.info('✅ Admin user created');

		// 3. Create default theme
		await db.insert(themes).values({
			_id: generateId(),
			name: 'SveltyCMS Default',
			path: '/themes/default',
			isActive: true,
			isDefault: true,
			config: {
				tailwindConfigPath: '/themes/default/tailwind.config.js',
				assetsPath: '/themes/default/assets'
			},
			createdAt: new Date(),
			updatedAt: new Date()
		});

		logger.info('✅ Default theme created');

		// 4. Create root system virtual folder
		await db.insert(systemVirtualFolders).values({
			_id: generateId(),
			name: 'mediaFolder',
			path: 'mediaFolder',
			parentId: null,
			order: 0,
			type: 'folder',
			createdAt: new Date(),
			updatedAt: new Date()
		});

		logger.info('✅ Root virtual folder created');

		logger.info('Database seeding completed successfully');
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('Database seeding failed:', message);
		return { success: false, error: message };
	}
}
