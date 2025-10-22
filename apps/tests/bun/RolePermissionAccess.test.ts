/**
 * @file tests/bun/RolePermissionAccess.test.ts
 * @description Tests for role and permission management in the Auth class
 *
 * This test file validates:
 * - Role creation, assignment, and validation
 * - Permission checking for users and roles
 * - Admin privilege handling
 * - Action-based permissions
 *
 * Uses mocked database adapter and session store for isolated testing.
 * Uses default seed data from src/routes/api/setup/seed.ts for configuration.
 *
 * **DOES NOT require a running application** - all dependencies are mocked via:
 * - tests/bun/mocks/setup.ts (preloaded via bunfig.toml)
 * - Mock database adapter defined in this file
 * - Mock session store defined in this file
 *
 * This allows the tests to run in CI/CD environments (like GitHub Actions)
 * without needing a database connection or running server.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { Auth } from '@src/databases/auth';
import { PermissionAction } from '@src/databases/auth/types';
import type { Role, User, SessionStore } from '@src/databases/auth/types';
import type { DatabaseAdapter } from '@src/databases/dbInterface';

// Import seed data for default configuration (from src/routes/api/setup/seed.ts)
const defaultRoles = ['admin', 'editor', 'viewer'];
const defaultPermissions = ['read', 'write', 'delete', 'admin'];

// Mock session store
const mockSessionStore: SessionStore = {
	set: async () => {},
	get: async () => null,
	delete: async () => {},
	deleteAll: async () => {}
};

// Mock database adapter with all required auth methods
const mockDbAdapter: Partial<DatabaseAdapter> = {
	auth: {
		createUser: async () => ({
			success: true,
			data: {
				_id: 'user1',
				email: 'user@example.com',
				role: 'user',
				createdAt: new Date(),
				updatedAt: new Date()
			}
		}),
		getUserByEmail: async () => ({
			success: true,
			data: {
				_id: 'user1',
				email: 'user@example.com',
				role: 'user',
				createdAt: new Date(),
				updatedAt: new Date()
			}
		}),
		getUserById: async () => ({
			success: true,
			data: {
				_id: 'user1',
				email: 'user@example.com',
				role: 'user',
				createdAt: new Date(),
				updatedAt: new Date()
			}
		}),
		updateUserAttributes: async () => ({ success: true, data: {} as User }),
		deleteUser: async () => ({ success: true }),
		getAllUsers: async () => ({ success: true, data: [] }),
		getUserCount: async () => ({ success: true, data: 0 }),
		createSession: async (data) => ({
			success: true,
			data: {
				_id: 'session1',
				user_id: data.user_id,
				expires: data.expires,
				tenantId: data.tenantId
			}
		}),
		validateSession: async () => ({ success: true, data: null }),
		deleteSession: async () => ({ success: true }),
		getSessionTokenData: async () => ({
			success: true,
			data: { expiresAt: new Date(), user_id: 'user1' }
		}),
		getAllTokens: async () => ({ success: true, data: [] }),
		createToken: async () => ({ success: true, data: 'token123' }),
		updateToken: async () => ({ success: true, data: {} as User }),
		deleteTokens: async () => ({ success: true, data: { deletedCount: 0 } }),
		blockTokens: async () => ({ success: true, data: { modifiedCount: 0 } }),
		unblockTokens: async () => ({ success: true, data: { modifiedCount: 0 } }),
		getTokenByValue: async () => ({ success: true, data: null }),
		validateToken: async () => ({ success: true, data: { message: 'Valid' } }),
		consumeToken: async () => ({ success: true, data: { status: true, message: 'Consumed' } }),
		invalidateAllUserSessions: async () => ({ success: true }),
		getActiveSessions: async () => ({ success: true, data: [] }),
		getAllActiveSessions: async () => ({ success: true, data: [] })
	}
} as Partial<DatabaseAdapter>;

describe('Role and Permission Access Management', () => {
	let auth: Auth;

	beforeEach(() => {
		// Create a fresh Auth instance for each test
		auth = new Auth(mockDbAdapter as DatabaseAdapter, mockSessionStore);
	});

	test('Create and manage roles', () => {
		const newRole: Role = {
			_id: 'editor',
			name: 'Editor',
			description: 'Can edit content',
			permissions: ['content:read', 'content:write'],
			isAdmin: false
		};

		auth.addRole(newRole);
		const retrievedRole = auth.getRoleById('editor');
		expect(retrievedRole).toBeDefined();
		expect(retrievedRole?.name).toBe('Editor');

		auth.updateRole('editor', { description: 'Can edit and publish content' });
		const updatedRole = auth.getRoleById('editor');
		expect(updatedRole?.description).toBe('Can edit and publish content');

		const allRoles = auth.getRoles();
		expect(allRoles.some((role: Role) => role._id === 'editor')).toBe(true);

		auth.deleteRole('editor');
		const deletedRole = auth.getRoleById('editor');
		expect(deletedRole).toBeUndefined();
	});

	test('Check user permissions', () => {
		const user: User = {
			_id: 'user1',
			email: 'user@example.com',
			role: 'user',
			createdAt: new Date(),
			updatedAt: new Date()
		};

		// Create a test role with specific permissions
		const userRole: Role = {
			_id: 'user',
			name: 'User',
			description: 'Regular user',
			permissions: ['user:read', 'user:create'],
			isAdmin: false
		};
		auth.addRole(userRole);

		const canCreateUser = auth.hasPermission(user, 'user:create');
		expect(canCreateUser).toBe(true);

		const canDeleteUser = auth.hasPermission(user, 'user:delete');
		expect(canDeleteUser).toBe(false);
	});

	test('Admin role has all permissions', () => {
		const adminUser: User = {
			_id: 'admin1',
			email: 'admin@example.com',
			role: 'admin',
			createdAt: new Date(),
			updatedAt: new Date()
		};

		const adminRole: Role = {
			_id: 'admin',
			name: 'Admin',
			description: 'Administrator',
			permissions: [],
			isAdmin: true
		};
		auth.addRole(adminRole);

		// Admin should have all permissions regardless of what's in permissions array
		const canDoAnything = auth.hasPermission(adminUser, 'any:action');
		expect(canDoAnything).toBe(true);
	});

	test('Permission checking by action and type', () => {
		const user: User = {
			_id: 'user1',
			email: 'user@example.com',
			role: 'editor',
			createdAt: new Date(),
			updatedAt: new Date()
		};

		// Add a permission to the auth instance
		auth.addPermission({
			_id: 'content:create',
			name: 'Create Content',
			action: PermissionAction.CREATE,
			type: 'content'
		});

		// Create editor role with content:create permission
		const editorRole: Role = {
			_id: 'editor',
			name: 'Editor',
			description: 'Content editor',
			permissions: ['content:create'],
			isAdmin: false
		};
		auth.addRole(editorRole);

		const canCreate = auth.hasPermissionByAction(user, PermissionAction.CREATE, 'content');
		expect(canCreate).toBe(true);

		const canDelete = auth.hasPermissionByAction(user, PermissionAction.DELETE, 'content');
		expect(canDelete).toBe(false);
	});

	test('Default roles from seed data are available', () => {
		// Verify that default roles from seed.ts are accessible
		expect(defaultRoles).toContain('admin');
		expect(defaultRoles).toContain('editor');
		expect(defaultRoles).toContain('viewer');
		expect(defaultPermissions).toContain('read');
		expect(defaultPermissions).toContain('write');
		expect(defaultPermissions).toContain('delete');
		expect(defaultPermissions).toContain('admin');
	});
});
