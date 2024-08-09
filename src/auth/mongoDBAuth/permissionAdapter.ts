/**
 * @file src/auth/mongoDBAuth/permissionAdapter.ts
 * @description MongoDB adapter for permission-related operations.
 *
 * This module provides functionality to:
 * - Create, update, delete, and retrieve permissions
 * - Manage permission schemas and models
 * - Interface with the MongoDB database for permission operations
 *
 * Features:
 * - CRUD operations for permissions
 * - Permission schema definition
 * - Integration with MongoDB through Mongoose
 * - Error handling and logging
 *
 * Usage:
 * Utilized by the auth system to manage permissions in a MongoDB database
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// Types
import type { Permission } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import logger from '@utils/logger';

// Define the Permission schema
export const PermissionSchema = new Schema(
	{
		name: { type: String, required: true }, // Name of the permission, required field
		action: { type: String, required: true }, // Action of the permission, required field
		description: String, // Description of the permission, optional field
		contextId: { type: String, required: true }, // ID of the context associated with the permission, required field
		contextType: { type: String, required: true }, // Type of the context associated with the permission, required field
		requiredRole: { type: String, default: 'admin' }, // Required role for the permission, required field
		requires2FA: Boolean // Whether the permission requires 2FA, optional field
	},
	{ timestamps: true }
);
export class PermissionAdapter implements Partial<authDBInterface> {
	private PermissionModel: Model<Permission & Document>;

	constructor() {
		// Create the Permission model
		this.PermissionModel = mongoose.models.auth_permissions || mongoose.model<Permission & Document>('auth_permissions', PermissionSchema);
	}

	// Create a new permission
	async createPermission(permissionData: Partial<Permission>, currentUserId: string): Promise<Permission> {
		try {
			const permission = new this.PermissionModel(permissionData);
			await permission.save();
			logger.info(`Permission created: ${permission.name} by user: ${currentUserId}`);
			return permission.toObject() as Permission;
		} catch (error) {
			logger.error(`Failed to create permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Update a permission
	async updatePermission(permission_id: string, permissionData: Partial<Permission>, currentUserId: string): Promise<void> {
		try {
			await this.PermissionModel.findByIdAndUpdate(permission_id, permissionData);
			logger.debug(`Permission updated: ${permission_id} by user: ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to update permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete a permission
	async deletePermission(permission_id: string, currentUserId: string): Promise<void> {
		try {
			await this.PermissionModel.findByIdAndDelete(permission_id);
			logger.info(`Permission deleted: ${permission_id} by user: ${currentUserId}`);
		} catch (error) {
			logger.error(`Failed to delete permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a permission by ID
	async getPermissionById(permission_id: string): Promise<Permission | null> {
		try {
			const permission = await this.PermissionModel.findById(permission_id);
			logger.debug(`Permission retrieved by ID: ${permission_id}`);
			return permission ? (permission.toObject() as Permission) : null;
		} catch (error) {
			logger.error(`Failed to get permission by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all permissions
	async getAllPermissions(options?: {
		limit?: number;
		skip?: number;
		sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][];
		filter?: object;
	}): Promise<Permission[]> {
		try {
			let query = this.PermissionModel.find(options?.filter || {});

			if (options?.sort) {
				query = query.sort(options.sort as any);
			}
			if (typeof options?.skip === 'number') {
				query = query.skip(options.skip);
			}
			if (typeof options?.limit === 'number') {
				query = query.limit(options.limit);
			}

			const permissions = await query.exec();
			logger.debug('All permissions retrieved');
			return permissions.map((permission) => permission.toObject() as Permission);
		} catch (error) {
			logger.error(`Failed to get all permissions: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a permission by name
	async getPermissionByName(name: string): Promise<Permission | null> {
		try {
			const permission = await this.PermissionModel.findOne({ name });
			logger.debug(`Permission retrieved by name: ${name}`);
			return permission ? (permission.toObject() as Permission) : null;
		} catch (error) {
			logger.error(`Failed to get permission by name: ${(error as Error).message}`);
			throw error;
		}
	}

	// Initialize default permissions
	async initializeDefaultPermissions(): Promise<void> {
		try {
			const defaultPermissions: Partial<Permission>[] = [
				{
					name: 'create_content',
					action: 'create',
					contextId: 'global',
					contextType: 'collection',
					description: 'Create new content',
					requiredRole: 'user'
				},
				{ name: 'read_content', action: 'read', contextId: 'global', contextType: 'collection', description: 'Read content', requiredRole: 'user' },
				{
					name: 'update_content',
					action: 'write',
					contextId: 'global',
					contextType: 'collection',
					description: 'Update existing content',
					requiredRole: 'user'
				},
				{
					name: 'delete_content',
					action: 'delete',
					contextId: 'global',
					contextType: 'collection',
					description: 'Delete content',
					requiredRole: 'admin'
				},
				{
					name: 'manage_users',
					action: 'manage_roles',
					contextId: 'global',
					contextType: 'system',
					description: 'Manage users',
					requiredRole: 'admin'
				},
				{
					name: 'manage_roles',
					action: 'manage_roles',
					contextId: 'global',
					contextType: 'system',
					description: 'Manage roles',
					requiredRole: 'admin'
				}
			];

			for (const permission of defaultPermissions) {
				const existingPermission = await this.getPermissionByName(permission.name!);
				if (!existingPermission) {
					await this.createPermission(permission, 'system');
					logger.info(`Default permission created: ${permission.name}`);
				}
			}
		} catch (error) {
			logger.error(`Failed to initialize default permissions: ${(error as Error).message}`);
			throw error;
		}
	}
}
