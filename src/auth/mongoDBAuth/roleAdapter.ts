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

import mongoose, { Schema } from 'mongoose';
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
	private RoleModel: mongoose.Model<Role & mongoose.Document>;

	constructor() {
		this.roles = [...configRoles];
		this.permissions = [...configPermissions];
		this.RoleModel = mongoose.models.auth_roles || mongoose.model<Role & mongoose.Document>('auth_roles', RoleSchema);
	}

	// Role Management Methods
	async createRole(roleData: Partial<Role>, currentUserId: string): Promise<Role> {
		const newRole: Role = {
			_id: Date.now().toString(),
			name: roleData.name!,
			description: roleData.description || '',
			permissions: roleData.permissions || []
		};
		this.roles.push(newRole);
		await this.syncConfigFile();
		logger.info(`Role created: ${newRole.name} by user: ${currentUserId}`);
		return newRole;
	}

	// Update role
	async updateRole(role_id: string, roleData: Partial<Role>, currentUserId: string): Promise<void> {
		try {
			await this.RoleModel.findByIdAndUpdate(role_id, roleData);
			const index = this.roles.findIndex((r) => r._id === role_id);
			if (index !== -1) {
				this.roles[index] = { ...this.roles[index], ...roleData };
			}
			await this.syncConfigFile();
			logger.debug(`Role updated: ${role_id} by user: ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to update role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete role
	async deleteRole(role_id: string, currentUserId: string): Promise<void> {
		try {
			await this.RoleModel.findByIdAndDelete(role_id);
			this.roles = this.roles.filter((r) => r._id !== role_id);
			await this.syncConfigFile();
			logger.info(`Role deleted: ${role_id} by user: ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to delete role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get role by ID
	async getRoleById(role_id: string): Promise<Role | null> {
		try {
			const role = await this.RoleModel.findById(role_id);
			return role ? role.toObject() : null;
		} catch (error) {
			logger.error(`Failed to get role by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all roles
	async getAllRoles(): Promise<Role[]> {
		return this.roles;
	}

	// Get role by name
	async getRoleByName(name: string): Promise<Role | null> {
		try {
			const role = await this.RoleModel.findOne({ name });
			return role ? role.toObject() : null;
		} catch (error) {
			logger.error(`Failed to get role by name: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get roles for a permission
	async getRolesForPermission(permission_name: string): Promise<Role[]> {
		try {
			const roles = await this.RoleModel.find({ permissions: permission_name });
			return roles.map((r) => r.toObject());
		} catch (error) {
			logger.error(`Failed to get roles for permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get permissions for a role
	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		try {
			const role = await this.RoleModel.findById(role_id);
			if (!role) {
				return [];
			}
			return role.permissions
				.map((permissionName) => {
					const permission = this.permissions.find((p) => p.name === permissionName);
					if (!permission) {
						logger.warn(`Permission ${permissionName} not found for role ${role_id}`);
						return null;
					}
					return permission;
				})
				.filter((p): p is Permission => p !== null);
		} catch (error) {
			logger.error(`Failed to get permissions for role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get users with role
	async getUsersWithRole(role_id: string): Promise<any[]> {
		// This is a placeholder implementation
		// In a real scenario, you would query the user collection to find users with this role
		logger.warn(`getUsersWithRole called for role ${role_id}. This method needs to be implemented properly.`);
		return [];
	}

	// Assign a permission to a role
	async assignPermissionToRole(role_id: string, permission_name: string, currentUserId: string): Promise<void> {
		try {
			const permission = this.permissions.find((p) => p.name === permission_name);
			if (!permission) {
				throw new Error(`Permission ${permission_name} not found`);
			}
			await this.RoleModel.findByIdAndUpdate(role_id, { $addToSet: { permissions: permission_name } });
			const roleIndex = this.roles.findIndex((r) => r._id === role_id);
			if (roleIndex !== -1 && !this.roles[roleIndex].permissions.includes(permission_name)) {
				this.roles[roleIndex].permissions.push(permission_name);
			}
			await this.syncConfigFile();
			logger.debug(`Permission ${permission_name} assigned to role ${role_id} by user ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to assign permission to role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Remove a permission from a role
	async removePermissionFromRole(role_id: string, permission_name: string, currentUserId: string): Promise<void> {
		try {
			await this.RoleModel.findByIdAndUpdate(role_id, { $pull: { permissions: permission_name } });
			const roleIndex = this.roles.findIndex((r) => r._id === role_id);
			if (roleIndex !== -1) {
				this.roles[roleIndex].permissions = this.roles[roleIndex].permissions.filter((p) => p !== permission_name);
			}
			await this.syncConfigFile();
			logger.debug(`Permission ${permission_name} removed from role ${role_id} by user ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to remove permission from role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Sync the roles with the config file
	async syncRolesWithConfig(): Promise<void> {
		try {
			// Update the database with roles from the config
			for (const configRole of configRoles) {
				let dbRole = await this.RoleModel.findOne({ name: configRole.name });
				if (!dbRole) {
					dbRole = new this.RoleModel(configRole);
				} else {
					dbRole.description = configRole.description;
					dbRole.permissions = configRole.permissions;
				}
				await dbRole.save();
			}

			// Remove roles from the database that are not in the config
			const dbRoles = await this.RoleModel.find();
			for (const dbRole of dbRoles) {
				if (!configRoles.some((r) => r.name === dbRole.name)) {
					await this.RoleModel.deleteOne({ _id: dbRole._id });
				}
			}

			// Update the in-memory roles
			this.roles = await this.getAllRoles();

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
