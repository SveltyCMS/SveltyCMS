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
 * Used by the auth system to manage roles and their permissions in a MongoDB database
 * The syncRolesWithConfig method ensures that the database reflects the current role configuration
 */

import { Schema } from 'mongoose';
import fs from 'fs/promises';
import path from 'path';

// Types
import type { authDBInterface } from '../authDBInterface';
import type { Permission, Role } from '../types';

// Import roles from config
import { roles as configRoles, permissions as configPermissions } from '../../../config/permissions';

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
	private roles: Role[];
	private permissions: Permission[];

	constructor() {
		this.roles = [...configRoles];
		this.permissions = [...configPermissions];
	}

	// Role Management Methods
	async createRole(roleData: Partial<Role>, currentUserId: string): Promise<Role> {
		if (!roleData.name) {
			throw new Error('Role name is required');
		}
		if (this.roles.some((r) => r.name === roleData.name)) {
			throw new Error('Role with this name already exists');
		}
		const newRole: Role = {
			name: roleData.name,
			description: roleData.description || '',
			permissions: roleData.permissions || []
		};
		this.roles.push(newRole);
		await this.syncConfigFile();
		logger.info(`Role created: ${newRole.name} by user: ${currentUserId}`);
		return newRole;
	}

	// Update role
	async updateRole(roleName: string, roleData: Partial<Role>, currentUserId: string): Promise<void> {
		const index = this.roles.findIndex((r) => r.name === roleName);
		if (index === -1) {
			throw new Error('Role not found');
		}
		this.roles[index] = { ...this.roles[index], ...roleData, name: roleName };
		await this.syncConfigFile();
		logger.debug(`Role updated: ${roleName} by user: ${currentUserId}`);
	}

	// Delete role
	async deleteRole(roleName: string, currentUserId: string): Promise<void> {
		const index = this.roles.findIndex((r) => r.name === roleName);
		if (index === -1) {
			throw new Error('Role not found');
		}
		this.roles.splice(index, 1);
		await this.syncConfigFile();
		logger.info(`Role deleted: ${roleName} by user: ${currentUserId}`);
	}

	// Get all roles
	async getAllRoles(): Promise<Role[]> {
		return this.roles;
	}

	// Get role by name
	async getRoleByName(name: string): Promise<Role | null> {
		return this.roles.find((r) => r.name === name) || null;
	}

	// Get permissions for a role
	async getPermissionsForRole(roleName: string): Promise<Permission[]> {
		const role = this.roles.find((r) => r.name === roleName);
		if (!role) {
			return [];
		}
		return this.permissions.filter((p) => role.permissions.includes(p.name));
	}

	// Get users with role
	async getUsersWithRole(role_id: string): Promise<any[]> {
		// This is a placeholder implementation
		// In a real scenario, you would query the user collection to find users with this role
		logger.warn(`getUsersWithRole called for role ${role_id}. This method needs to be implemented properly.`);
		return [];
	}

	// Assign a permission to a role
	async assignPermissionToRole(roleName: string, permissionName: string, currentUserId: string): Promise<void> {
		const role = this.roles.find((r) => r.name === roleName);
		if (!role) {
			throw new Error('Role not found');
		}
		if (!role.permissions.includes(permissionName)) {
			role.permissions.push(permissionName);
			await this.syncConfigFile();
			logger.debug(`Permission ${permissionName} assigned to role ${roleName} by user ${currentUserId}`);
		}
	}

	// Remove a permission from a role
	async removePermissionFromRole(roleName: string, permissionName: string, currentUserId: string): Promise<void> {
		const role = this.roles.find((r) => r.name === roleName);
		if (!role) {
			throw new Error('Role not found');
		}
		role.permissions = role.permissions.filter((p) => p !== permissionName);
		await this.syncConfigFile();
		logger.debug(`Permission ${permissionName} removed from role ${roleName} by user ${currentUserId}`);
	}

	// Get roles for a permission
	async getRolesForPermission(permissionName: string): Promise<Role[]> {
		return this.roles.filter((role) => role.permissions.includes(permissionName));
	}

	// Sync the roles with the config file
	async syncRolesWithConfig(): Promise<void> {
		try {
			// Reset roles to the configuration
			this.roles = [...configRoles];

			// Optionally, you might want to perform some validation or additional processing here

			await this.syncConfigFile();
			logger.info('Roles synced with configuration successfully');
		} catch (error) {
			logger.error(`Failed to sync roles with config: ${(error as Error).message}`);
			throw error;
		}
	}

	// Sync the config file with the default roles and permission
	private async syncConfigFile(): Promise<void> {
		const configPath = path.resolve(__dirname, '../../../config/permissions.ts');
		const content = `
import type { Permission, Role } from '../src/auth/types';

export const permissions: Permission[] = ${JSON.stringify(this.permissions, null, 2)};

export const roles: Role[] = ${JSON.stringify(this.roles, null, 2)};
        `;

		try {
			await fs.writeFile(configPath, content, 'utf8');
			logger.info('Config file updated with new roles and permissions');
		} catch (error) {
			logger.error(`Failed to update config file: ${(error as Error).message}`);
			throw new Error('Failed to update config file');
		}
	}

	// Get all permissions
	async getAllPermissions(): Promise<Permission[]> {
		return this.permissions;
	}

	// Get a permission by name
	async getPermissionByName(name: string): Promise<Permission | null> {
		return this.permissions.find((p) => p.name === name) || null;
	}
}
