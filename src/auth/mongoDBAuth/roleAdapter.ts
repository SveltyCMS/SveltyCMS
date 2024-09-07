/**
 * @file src/auth/mongoDBAuth/roleAdapter.ts
 * @description MongoDB adapter for role-related operations.
 *
 * This module provides functionality to:
 * - Create, update, delete, and retrieve roles
 * - Manage role schemas and models
 * - Handle role-permission associations
 * - Synchronize roles with the configuration defined in config/permissions.ts
 *
 * Features:
 * - CRUD operations for roles
 * - Role schema definition
 * - Permission assignment to roles
 * - User-role associations
 * - Integration with MongoDB through Mongoose
 * - Dynamic role synchronization with configuration
 *
 * Usage:
 * Used by the auth system to manage roles and their permissions in a MongoDB database.
 * The syncRolesWithConfig method ensures that the database reflects the current role configuration.
 */

import { Schema } from 'mongoose';
import fs from 'fs/promises';
import path from 'path';

// Types
import type { authDBInterface } from '../authDBInterface';
import type { Role, Permission } from '../types';

// Import permission manager functions
import { getPermissionByName, getAllPermissions } from '../permissionManager';

// Import roles from config
import { roles as configRoles } from '@root/config/roles';

// System Logging
import logger from '@utils/logger';

// Define the Role schema
export const RoleSchema = new Schema(
	{
		name: { type: String, required: true },
		description: String,
		permissions: [{ type: String }] // Store permission names as strings
	},
	{ timestamps: true }
);

// Define the Role adapter
export class RoleAdapter implements Partial<authDBInterface> {
	private roles: Map<string, Role>; // Use a Map for faster lookups

	constructor() {
		this.roles = new Map(configRoles.map((role) => [role._id, role])); // Initialize roles using Map
	}

	// Create a new role
	async createRole(roleData: Partial<Role>, current_user_id: string): Promise<Role> {
		if (!roleData.name) throw new Error('Role name is required');

		if (this.roles.has(roleData.name)) throw new Error('Role with this name already exists');

		const newRole: Role = {
			_id: roleData._id,
			name: roleData.name,
			description: roleData.description || '',
			permissions: roleData.permissions || []
		};

		this.roles.set(newRole._id, newRole);
		await this.syncConfigFile();
		logger.info(`Role created: ${newRole.name} by user: ${current_user_id}`);
		return newRole;
	}

	// Update role
	async updateRole(role_id: string, roleData: Partial<Role>, current_user_id: string): Promise<void> {
		const role = this.roles.get(role_id);
		if (!role) throw new Error('Role not found');

		this.roles.set(role_id, { ...role, ...roleData });
		await this.syncConfigFile();
		logger.debug(`Role updated: ${role.name} by user: ${current_user_id}`);
	}

	// Delete role
	async deleteRole(role_id: string, current_user_id: string): Promise<void> {
		if (!this.roles.has(role_id)) throw new Error('Role not found');

		this.roles.delete(role_id);
		await this.syncConfigFile();
		logger.info(`Role deleted: ${role_id} by user: ${current_user_id}`);
	}

	// Update permission
	async updatePermission(permission_name: string, updateData: Partial<Permission>, current_user_id: string): Promise<void> {
		const permission = await getPermissionByName(permission_name);
		if (!permission) throw new Error('Permission not found');

		Object.assign(permission, updateData);
		await this.syncConfigFile();
		logger.info(`Permission updated: ${permission_name} by user: ${current_user_id}`);
	}

	// Delete permission
	async deletePermission(permission_name: string, current_user_id: string): Promise<void> {
		const permissionIndex = [...this.roles.values()].findIndex((role) => role.permissions.has(permission_name));

		if (permissionIndex === -1) throw new Error('Permission not found');

		this.roles.forEach((role) => role.permissions.delete(permission_name));
		await this.syncConfigFile();
		logger.info(`Permission deleted: ${permission_name} by user: ${current_user_id}`);
	}

	// Get role by id
	async getRoleById(role_id: string): Promise<Role | null> {
		const role = this.roles.get(role_id) || null;
		if (!role) logger.warn(`Role not found: ${role_id}`);
		return role;
	}

	// Get all roles
	async getAllRoles(options?: {
		limit?: number;
		skip?: number;
		sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][];
		filter?: object;
	}): Promise<Role[]> {
		let filteredRoles = [...this.roles.values()];

		// Apply filtering, sorting, and pagination if options are provided
		if (options?.filter) {
			filteredRoles = filteredRoles.filter((role) => Object.entries(options.filter!).every(([key, value]) => (role as any)[key] === value));
		}

		if (options?.sort) {
			const sortKeys = Object.keys(options.sort);
			filteredRoles.sort((a, b) =>
				sortKeys.reduce((acc, key) => acc || ((a as any)[key] > (b as any)[key] ? 1 : -1) * (options.sort![key] as number), 0)
			);
		}

		if (typeof options?.skip === 'number') filteredRoles = filteredRoles.slice(options.skip);
		if (typeof options?.limit === 'number') filteredRoles = filteredRoles.slice(0, options.limit);

		logger.debug('All roles retrieved with options applied');
		return filteredRoles;
	}

	// Get role by name
	async getRoleByName(name: string): Promise<Role | null> {
		const role = [...this.roles.values()].find((r) => r.name === name) || null;
		if (!role) logger.warn(`Role not found: ${name}`);
		return role;
	}

	// Get permissions for a role
	async getPermissionsForRole(role_name: string): Promise<Permission[]> {
		const role = [...this.roles.values()].find((r) => r.name === role_name);
		if (!role) return [];

		const allPermissions = await getAllPermissions();
		const rolePermissions = allPermissions.filter((p) => role.permissions.has(p.name));
		logger.debug(`Permissions for role ${role_name} retrieved`);
		return rolePermissions;
	}

	// Assign a permission to a role
	async assignPermissionToRole(role_name: string, permission_name: string, current_user_id: string): Promise<void> {
		const role = [...this.roles.values()].find((r) => r.name === role_name);
		if (!role) throw new Error('Role not found');

		const permission = await getPermissionByName(permission_name);
		if (!permission) throw new Error('Permission not found');

		if (!role.permissions.has(permission_name)) {
			role.permissions.add(permission_name);
			await this.syncConfigFile();
			logger.debug(`Permission ${permission_name} assigned to role ${role_name} by user ${current_user_id}`);
		}
	}

	// Remove a permission from a role
	async deletePermissionFromRole(role_name: string, permission_name: string, current_user_id: string): Promise<void> {
		const role = [...this.roles.values()].find((r) => r.name === role_name);
		if (!role) throw new Error('Role not found');

		role.permissions.delete(permission_name);
		await this.syncConfigFile();
		logger.debug(`Permission ${permission_name} deleted from role ${role_name} by user ${current_user_id}`);
	}

	// Get roles for a permission
	async getRolesForPermission(permission_name: string): Promise<Role[]> {
		const rolesWithPermission = [...this.roles.values()].filter((role) => role.permissions.has(permission_name));
		logger.debug(`Roles with permission ${permission_name} retrieved`);
		return rolesWithPermission;
	}

	// Sync the roles with the config file
	async syncRolesWithConfig(): Promise<void> {
		try {
			this.roles = new Map(configRoles.map((role) => [role._id, role]));

			await this.syncConfigFile();
			logger.info('Roles synced with configuration successfully');
		} catch (error) {
			logger.error(`Failed to sync roles with config: ${(error as Error).message}`);
			throw error;
		}
	}

	async setAllRoles(roles: Role[]): Promise<void> {
		try {
			this.roles = roles;
			await this.syncConfigFile();
			logger.info('Roles synced with configuration successfully');
		} catch (error) {
			logger.error(`Failed to sync roles with config: ${(error as Error).message}`);
			throw error;
		}
	}

	// Method to update a user's role
	async updateUserRole(user_id: string, newRole: RoleId): Promise<void> {
		// Assuming there's a User model or collection to update the user's role
		const UserModel = mongoose.model('User'); // Replace with actual User model if necessary

		const user = await UserModel.findById(user_id);
		if (!user) {
			throw new Error('User not found');
		}

		// Admin protection: Make sure the first/only admin user can't change their role unintentionally
		const adminUsersCount = await UserModel.countDocuments({ role: 'admin' });
		if (user.role === 'admin' && adminUsersCount === 1 && newRole !== 'admin') {
			throw new Error('The only admin user cannot change their role to a non-admin role');
		}

		// Update the user's role
		user.role = newRole;
		await user.save();

		logger.info(`User role updated: ${user.email} -> ${newRole}`);
	}

	// Sync the config file with the default roles and permissions
	private async syncConfigFile(): Promise<void> {
		const configPath = path.resolve('./config/roles.ts');
		const roles = [...this.roles.values()].map((cur) => {
			if (cur.isAdmin) {
				return { _id: cur._id, name: cur.name, description: cur.description, isAdmin: true, permissions: `permissions.map((p) => p._id)` };
			}
			return { _id: cur._id, name: cur.name, description: cur.description, permissions: cur.permissions };
		});
		const content = `
import type { Permission, Role } from '../src/auth/types';
import { permissions } from './permissions'; // Import the permissions list

export const roles: Role[] = ${JSON.stringify([...roles], null, 2)};
// Function to register a new role
export function registerRole(newRole: Role): void {
	const exists = roles.some((role) => role._id === newRole._id); // Use _id for consistency
	if (!exists) {
		roles.push(newRole);
	}
}

// Function to register multiple roles
export function registerRoles(newRoles: Role[]): void {
	newRoles.forEach(registerRole);
}

`;
		const search = 'permissions.map((p) => p._id)';
		const startIndex = content.search('permissions.map');
		let newContent = content.substring(0, startIndex - 1);
		newContent = newContent + content.substring(startIndex, startIndex + search.length);
		newContent = newContent + content.substring(startIndex + search.length + 1);

		try {
			await fs.writeFile(configPath, newContent, 'utf8');
			logger.info('Config file updated with new roles and permissions');
		} catch (error) {
			logger.error(`Failed to update config file: ${(error as Error).message}`);
			throw new Error('Failed to update config file');
		}
	}
}
