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

import mongoose, { Schema, Document, Model } from 'mongoose';
import { UserSchema } from './userAdapter';

// Types
import type { Permission, Role, User } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import logger from '@utils/logger';

// Import roles from config
import { roles as configRoles } from '../../../config/permissions';

// Define the Role schema
export const RoleSchema = new Schema(
	{
		name: { type: String, required: true }, // Name of the role, required field
		description: String, // Description of the role, optional field
		permissions: [{ type: Schema.Types.ObjectId, ref: 'auth_permissions' }] // Permissions associated with the role, optional field
	},
	{ timestamps: true }
);

export class RoleAdapter implements Partial<authDBInterface> {
	private RoleModel: Model<Role & Document>;
	private UserModel: Model<User & Document>;

	constructor() {
		// Create the Role model
		this.RoleModel = mongoose.models.auth_roles || mongoose.model<Role & Document>('auth_roles', RoleSchema);
		this.UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserSchema);
	}

	// Create a new role
	async createRole(roleData: Partial<Role>, currentUserId: string): Promise<Role> {
		try {
			const role = new this.RoleModel(roleData);
			await role.save();
			logger.info(`Role created: ${role.name} by user: ${currentUserId}`);
			return role.toObject() as Role;
		} catch (error) {
			logger.error(`Failed to create role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Update a role
	async updateRole(role_id: string, roleData: Partial<Role>, currentUserId: string): Promise<void> {
		try {
			await this.RoleModel.findByIdAndUpdate(role_id, roleData);
			logger.debug(`Role updated: ${role_id} by user: ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to update role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete a role
	async deleteRole(role_id: string, currentUserId: string): Promise<void> {
		try {
			await this.RoleModel.findByIdAndDelete(role_id);
			logger.info(`Role deleted: ${role_id} by user: ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to delete role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a role by ID
	async getRoleById(role_id: string): Promise<Role | null> {
		try {
			const role = await this.RoleModel.findById(role_id).populate('permissions');
			logger.debug(`Role retrieved by ID: ${role_id}`);
			return role ? (role.toObject() as Role) : null;
		} catch (error) {
			logger.error(`Failed to get role by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all roles
	async getAllRoles(options?: {
		limit?: number;
		skip?: number;
		sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][];
		filter?: object;
	}): Promise<Role[]> {
		try {
			let query = this.RoleModel.find(options?.filter || {});

			if (options?.sort) {
				query = query.sort(options.sort as any);
			}
			if (typeof options?.skip === 'number') {
				query = query.skip(options.skip);
			}
			if (typeof options?.limit === 'number') {
				query = query.limit(options.limit);
			}

			const roles = await query.exec();
			return roles.map((role) => role.toObject() as Role);
		} catch (error) {
			logger.error(`Failed to get all roles: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a role by name
	async getRoleByName(name: string): Promise<Role | null> {
		try {
			const role = await this.RoleModel.findOne({ name }).populate('permissions');
			logger.debug(`Role retrieved by name: ${name}`);
			return role ? (role.toObject() as Role) : null;
		} catch (error) {
			logger.error(`Failed to get role by name: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all roles for a permission
	async getRolesForPermission(permission_id: string): Promise<Role[]> {
		try {
			const roles = await this.RoleModel.find({ permissions: permission_id });
			return roles.map((role) => role.toObject() as Role);
		} catch (error) {
			logger.error(`Failed to get roles for permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get users with a role
	async getUsersWithRole(role_id: string): Promise<User[]> {
		try {
			const users = await this.UserModel.find({ roles: role_id });
			return users.map((user) => user.toObject() as User);
		} catch (error) {
			logger.error(`Failed to get users with role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get permissions for a role
	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		try {
			const role = await this.RoleModel.findById(role_id).populate('permissions');
			return role ? (role.permissions as unknown as Permission[]) : [];
		} catch (error) {
			logger.error(`Failed to get permissions for role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Assign a permission to a role
	async assignPermissionToRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
		try {
			await this.RoleModel.findByIdAndUpdate(role_id, { $addToSet: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} assigned to role ${role_id} by user ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to assign permission to role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Remove a permission from a role
	async removePermissionFromRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
		try {
			await this.RoleModel.findByIdAndUpdate(role_id, { $pull: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} removed from role ${role_id} by user ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to remove permission from role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Sync roles with configuration
	async syncRolesWithConfig(): Promise<void> {
		try {
			for (const roleData of configRoles) {
				let role = await this.getRoleByName(roleData.name);
				if (!role) {
					role = await this.createRole(roleData, 'system');
					logger.info(`Role created from config: ${roleData.name}`);
				} else {
					// Update existing role
					await this.updateRole(role._id!, roleData, 'system');
					logger.info(`Role updated from config: ${roleData.name}`);
				}

				// Sync permissions
				const dbPermissions = await this.getPermissionsForRole(role._id!);
				const configPermissions = roleData.permissions;

				// Remove permissions not in config
				for (const dbPerm of dbPermissions) {
					if (!configPermissions.includes(dbPerm.name)) {
						await this.removePermissionFromRole(role._id!, dbPerm._id!, 'system');
					}
				}

				// Add new permissions from config
				for (const permName of configPermissions) {
					if (permName === 'all') {
						// Assign all permissions
						const allPerms = await this.getAllPermissions();
						for (const perm of allPerms) {
							await this.assignPermissionToRole(role._id!, perm._id!, 'system');
						}
					} else if (!dbPermissions.some((dbPerm) => dbPerm.name === permName)) {
						const perm = await this.getPermissionByName(permName);
						if (perm) {
							await this.assignPermissionToRole(role._id!, perm._id!, 'system');
						}
					}
				}
			}

			// Remove roles not in config
			const dbRoles = await this.getAllRoles();
			for (const dbRole of dbRoles) {
				if (!configRoles.some((configRole) => configRole.name === dbRole.name)) {
					await this.deleteRole(dbRole._id!, 'system');
					logger.info(`Role deleted as it's not in config: ${dbRole.name}`);
				}
			}

			logger.info('Roles synced with configuration successfully');
		} catch (error) {
			logger.error(`Failed to sync roles with config: ${(error as Error).message}`);
			throw error;
		}
	}

	// This method needs to be implemented or imported from the PermissionAdapter
	async getAllPermissions(): Promise<Permission[]> {
		// Implementation needed
		throw new Error('Method not implemented');
	}

	// This method needs to be implemented or imported from the PermissionAdapter
	async getPermissionByName(name: string): Promise<Permission | null> {
		// Implementation needed
		throw new Error('Method not implemented');
	}
}
