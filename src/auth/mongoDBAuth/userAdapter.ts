/**
 * @file src/auth/mongoDBAuth/userAdapter.ts
 * @d	resetRequestedAt: { type: Date }, // Timestamp for when the user requested a password reset, optional field
	resetToken: String, // Token for resetting the user's password, optional field
	lockoutUntil: { type: Date }, // Timestamp for when the user is locked out, optional field
	is2FAEnabled: Boolean, // Whether the user has 2FA enabled, optional field
	totpSecret: String, // TOTP secret for 2FA (base32 encoded), optional field
	backupCodes: [String], // Array of hashed backup codes for 2FA recovery, optional field
	last2FAVerification: { type: Date } // Timestamp of last successful 2FA verification, optional fieldiption MongoDB adapter for user-related operations.
 *
 * This module provides functionality to:
 * - Create, update, delete, and retrieve users
 * - Manage user schemas and models
 * - Handle user authentication and permissions
 *
 * Features:
 * - CRUD operations for users
 * - User schema definition
 * - User-role and user-permission associations
 * - Password hashing and verification
 * - Integration with MongoDB through Mongoose
 *
 * Usage:
 * Utilized by the auth system to manage user accounts in a MongoDB database
 */
import type { Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

import { roles as configRoles } from '@root/config/roles';
import { error } from '@sveltejs/kit';

// Adapter
import { getAllPermissions } from '../permissions';

// Types
import type { Permission, Role, User } from '..';
import type { authDBInterface, PaginationOption } from '../authDBInterface';

// System Logging
import { logger } from '@utils/logger.svelte';

// Define the User schema
export const UserSchema = new Schema(
	{
		email: { type: String, required: true, unique: true }, // User's email, required field
		tenantId: { type: String, index: true }, // Tenant identifier for multi-tenancy, indexed for performance
		password: { type: String }, // User's password, optional field
		role: { type: String, required: true }, // User's role, required field
		permissions: [{ type: String }], // User-specific permissions as names, optional field
		username: String, // User's username, optional field
		firstName: String, // First name of the user
		lastName: String, // Last name of the user
		locale: String, // Locale of the user
		avatar: String, // URL of the user's avatar, optional field
		lastAuthMethod: String, // Last authentication method used by the user, optional field
		lastActiveAt: { type: Date, default: Date.now }, // Last time the user was active as ISO string, optional field
		expiresAt: { type: Date }, // Expiration timestamp as ISO string, optional field
		isRegistered: Boolean, // Registration status of the user, optional field
		failedAttempts: { type: Number, default: 0 }, // Number of failed login attempts, optional field
		blocked: Boolean, // Whether the user is blocked, optional field
		resetRequestedAt: { type: Date }, // Timestamp for when the user requested a password reset, optional field
		resetToken: String, // Token for resetting the user's password, optional field
		lockoutUntil: { type: Date }, // Timestamp for when the user is locked out, optional field
		is2FAEnabled: Boolean // Whether the user has 2FA enabled, optional field
	},
	{
		timestamps: true // Automatically adds `createdAt` and `updatedAt` fields
	}
);

export class UserAdapter implements Partial<authDBInterface> {
	private UserModel: Model<User>;

	constructor() {
		this.UserModel = mongoose.models?.auth_users || mongoose.model<User>('auth_users', UserSchema);
	}

	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			// Normalize email to lowercase if present
			const normalizedUserData = {
				...userData,
				email: userData.email?.toLowerCase()
			};

			// Log exactly what we received
			logger.debug('UserAdapter.createUser received data:', {
				...normalizedUserData,
				email: normalizedUserData.email?.replace(/(.{2}).*@(.*)/, '$1****@$2'),
				avatar: `Avatar value: "${normalizedUserData.avatar}" (type: ${typeof normalizedUserData.avatar}, length: ${normalizedUserData.avatar?.length || 0})`
			});

			const user = new this.UserModel(normalizedUserData);

			// Log what the model contains before saving
			logger.debug('UserModel before save:', {
				email: user.email?.replace(/(.{2}).*@(.*)/, '$1****@$2'),
				avatar: `Model avatar: "${user.avatar}" (type: ${typeof user.avatar})`,
				hasAvatar: !!user.avatar
			});

			await user.save();

			// Log what was actually saved
			logger.debug('User created and saved:', {
				_id: user._id,
				email: user.email?.replace(/(.{2}).*@(.*)/, '$1****@$2'),
				avatar: `Saved avatar: "${user.avatar}" (type: ${typeof user.avatar})`,
				allFields: Object.keys(user.toObject())
			});

			const savedUser = user.toObject();
			savedUser._id = savedUser._id.toString();
			return savedUser as User;
		} catch (err) {
			const message = `Error in UserAdapter.createUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				email: userData.email?.replace(/(.{2}).*@(.*)/, '$1****@$2'),
				error: err,
				userData: Object.keys(userData)
			});
			throw error(500, message);
		}
	}

	// Edit a user
	async updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<User> {
		try {
			const filter: Record<string, unknown> = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const user = await this.UserModel.findOneAndUpdate(filter, userData, { new: true }).lean();
			if (!user) {
				throw error(404, `User not found for ID: \x1b[34m${user_id}\x1b[0m ${tenantId ? `in tenant: ${tenantId}` : ''}`);
			}
			user._id = user._id.toString();
			logger.debug(`User attributes updated: \x1b[34m${user_id}\x1b[0m`, { tenantId });
			return user as User;
		} catch (err) {
			const message = `Error in UserAdapter.updateUserAttributes: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, tenantId });
			throw error(500, message);
		}
	}

	// Get all users with optional filtering, sorting, and pagination
	async getAllUsers(options?: PaginationOption): Promise<User[]> {
		try {
			let query = this.UserModel.find(options?.filter || {}).lean();

			if (options?.sort) {
				const sortOptions: Record<string, 1 | -1> = {};
				if (Array.isArray(options.sort)) {
					options.sort.forEach(([field, direction]) => {
						sortOptions[field] = direction === 'asc' ? 1 : -1;
					});
				} else {
					Object.entries(options.sort).forEach(([field, direction]) => {
						sortOptions[field] = direction === 'asc' ? 1 : -1;
					});
				}
				query = query.sort(sortOptions);
			}

			if (typeof options?.offset === 'number') {
				query = query.skip(options.offset);
			}
			if (typeof options?.limit === 'number') {
				query = query.limit(options.limit);
			}

			const users = await query.exec();
			return users.map((user) => {
				user._id = user._id.toString();
				return user as User;
			});
		} catch (err) {
			const message = `Error in UserAdapter.getAllUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { options });
			throw error(500, message);
		}
	}

	// Get the count of users
	async getUserCount(filter?: Record<string, unknown>): Promise<number> {
		try {
			const count = await this.UserModel.countDocuments(filter || {});
			logger.debug(`User count retrieved: \x1b[34m${count}\x1b[0m`);
			return count;
		} catch (err) {
			const message = `Error in UserAdapter.getUserCount: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { filter });
			throw error(500, message);
		}
	}

	// Get users with a permission
	async getUsersWithPermission(permissionName: string): Promise<User[]> {
		try {
			const users = await this.UserModel.find({ permissions: permissionName }).lean();
			logger.debug(`Users with permission \x1b[34m${permissionName}\x1b[0m retrieved`);
			return users.map((user) => {
				user._id = user._id.toString();
				return user as User;
			});
		} catch (err) {
			const message = `Error in UserAdapter.getUsersWithPermission: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { permissionName });
			throw error(500, message);
		}
	}

	// Assign a permission to a user
	async assignPermissionToUser(user_id: string, permissionName: string): Promise<void> {
		const allPermissions = await getAllPermissions();
		const permission = allPermissions.find((p) => p._id === permissionName);
		if (!permission) {
			logger.warn(`Permission not found: \x1b[34m${permissionName}\x1b[0m`);
			throw error(404, `Permission not found: ${permissionName}`);
		}
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $addToSet: { permissions: permissionName } });
			logger.info(`Permission \x1b[34m${permissionName}\x1b[0m assigned to user\x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.assignPermissionToUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			throw error(500, message);
		}
	}

	// Remove a permission from a user
	async deletePermissionFromUser(user_id: string, permissionName: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $pull: { permissions: permissionName } });
			logger.info(`Permission \x1b[34m${permissionName}\x1b[0m removed from user \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.deletePermissionFromUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			throw error(500, message);
		}
	}

	// Get permissions for a user
	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user) {
				logger.warn(`User not found: ${user_id}`);
				return [];
			}

			user._id = user._id.toString();
			const directPermissions = new Set(user.permissions || []);
			const allPermissions = await getAllPermissions();
			const userPermissions = allPermissions.filter((perm) => directPermissions.has(perm._id));

			const uniquePermissions = Array.from(new Set(userPermissions.map((p) => p._id))).map((id) =>
				userPermissions.find((p) => p._id === id)
			) as Permission[];

			logger.debug(`Permissions retrieved for user: \x1b[34m${user_id}\x1b[0m`);
			return uniquePermissions;
		} catch (err) {
			const message = `Error in UserAdapter.getPermissionsForUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}

	// Check if a user has a specific permission
	async hasPermissionByAction(user_id: string, permissionName: string): Promise<boolean> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user) {
				logger.warn(`User not found: \x1b[34m${user_id}\x1b[0m`);
				return false;
			}

			user._id = user._id.toString();
			const directPermissions = new Set(user.permissions || []);
			const hasDirectPermission = directPermissions.has(permissionName);
			if (hasDirectPermission) {
				return true;
			}

			logger.debug(`User ${user_id} does not have permission: \x1b[34m${permissionName}\x1b[0m`);
			return false;
		} catch (err) {
			const message = `Error in UserAdapter.hasPermissionByAction: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			throw error(500, message);
		}
	}

	// Change user password
	async changePassword(user_id: string, newPassword: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { password: newPassword });
			logger.info(`Password changed for user: \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.changePassword: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}

	// Block a user
	async blockUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				blocked: true,
				lockoutUntil: new Date().toISOString() // Set lockoutUntil to current time
			});
			logger.info(`User blocked: \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.blockUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}

	// Unblock a user
	async unblockUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				blocked: false,
				lockoutUntil: null // Clear lockoutUntil
			});
			logger.info(`User unblocked: \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.unblockUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}

	// Block multiple users
	async blockUsers(userIds: string[], tenantId?: string): Promise<void> {
		try {
			const filter: Record<string, unknown> = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			await this.UserModel.updateMany(filter, {
				blocked: true,
				lockoutUntil: new Date().toISOString() // Set lockoutUntil to current time
			});
			logger.info(`Users blocked: \x1b[34m${userIds.join(', ')}\x1b[0m`, { tenantId });
		} catch (err) {
			const message = `Error in UserAdapter.blockUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			throw error(500, message);
		}
	}

	// Unblock multiple users
	async unblockUsers(userIds: string[], tenantId?: string): Promise<void> {
		try {
			const filter: Record<string, unknown> = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			await this.UserModel.updateMany(filter, {
				blocked: false,
				lockoutUntil: null // Clear lockoutUntil
			});
			logger.info(`Users unblocked: \x1b[34m${userIds.join(', ')}\x1b[0m`, { tenantId });
		} catch (err) {
			const message = `Error in UserAdapter.unblockUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			throw error(500, message);
		}
	}

	// Delete a user
	async deleteUser(user_id: string, tenantId?: string): Promise<void> {
		try {
			const filter: Record<string, unknown> = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			await this.UserModel.findOneAndDelete(filter);
			logger.info(`User deleted: \x1b[34m${user_id}\x1b[0m`, { tenantId });
		} catch (err) {
			const message = `Error in UserAdapter.deleteUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, tenantId });
			throw error(500, message);
		}
	}

	// Delete multiple users
	async deleteUsers(userIds: string[], tenantId?: string): Promise<void> {
		try {
			const filter: Record<string, unknown> = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			await this.UserModel.deleteMany(filter);
			logger.info(`Users deleted: \x1b[34m${userIds.join(', ')}\x1b[0m`, { tenantId });
		} catch (err) {
			const message = `Error in UserAdapter.deleteUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			throw error(500, message);
		}
	}

	// Get a user by ID
	async getUserById(user_id: string, tenantId?: string): Promise<User | null> {
		try {
			const filter: Record<string, unknown> = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const user = await this.UserModel.findOne(filter).lean();
			if (user) {
				user._id = user._id.toString();
				logger.debug(`User retrieved by ID: \x1b[34m${user_id}\x1b[0m`, {
					tenantId: tenantId || '\x1b[34mnone\x1b[0m (single-tenant mode)'
				});
				return user as User;
			} else {
				return null;
			}
		} catch (err) {
			const message = `Error in UserAdapter.getUserById: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				user_id,
				tenantId: tenantId || '\x1b[34mnone\x1b[0m (single-tenant mode)'
			});
			throw error(500, message);
		}
	} // Get a user by email
	async getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<User | null> {
		try {
			const normalizedEmail = criteria.email.toLowerCase();
			const filter: Record<string, unknown> = { email: normalizedEmail };
			if (criteria.tenantId) {
				filter.tenantId = criteria.tenantId;
			}

			const user = await this.UserModel.findOne(filter).lean();
			if (user) {
				user._id = user._id.toString();
				logger.debug(`User retrieved by email:`, {
					email: normalizedEmail,
					tenantId: criteria.tenantId || '\x1b[34mnone\x1b[0m (single-tenant mode)'
				});
				return user as User;
			} else {
				return null;
			}
		} catch (err) {
			const message = `Error in UserAdapter.getUserByEmail: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				email: criteria.email,
				tenantId: criteria.tenantId || '\x1b[34mnone\x1b[0m (single-tenant mode)'
			});
			throw error(500, message);
		}
	}

	// Assign a role to a user
	async assignRoleToUser(user_id: string, role: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { role });
			logger.info(`Role ${role} assigned to user \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.assignRoleToUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, role });
			throw error(500, message);
		}
	}

	// Remove a role from a user
	async removeRoleFromUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $unset: { role: '' } });
			logger.info(`Role removed from user \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.removeRoleFromUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}

	// Get roles for a user
	async getRolesForUser(user_id: string): Promise<Role[]> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user || !user.role) {
				logger.warn(`User or role not found for user ID: \x1b[34m${user_id}\x1b[0m`);
				return [];
			}

			user._id = user._id.toString();
			// Fetch the role from the file-based roles configuration
			const role = configRoles.find((r) => r._id === user.role);
			if (!role) {
				logger.warn(`Role not found: \x1b[34m${user.role}\x1b[0m for user ID: \x1b[34m${user_id}\x1b[0m`);
				return [];
			}

			logger.debug(`Roles retrieved for user ID: \x1b[34m${user_id}\x1b[0m`);
			return [role];
		} catch (err) {
			const message = `Error in UserAdapter.getRolesForUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}

	// Fetch the last 5 users who logged in
	async getRecentUserActivities(): Promise<User[]> {
		try {
			const recentUsers = await this.UserModel.find({ lastActiveAt: { $ne: null } })
				.sort({ lastActiveAt: -1 })
				.limit(5)
				.select('email username lastActiveAt')
				.lean();

			logger.debug('Retrieved recent user activities');
			return recentUsers.map((user) => {
				user._id = user._id.toString();
				return user as User;
			});
		} catch (err) {
			const message = `Error in UserAdapter.getRecentUserActivities: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Check user role
	async checkUserRole(user_id: string, role_name: string): Promise<boolean> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (user) {
				user._id = user._id.toString();
				return user.role === role_name;
			}
			return false;
		} catch (err) {
			const message = `Error in UserAdapter.checkUserRole: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, role_name });
			throw error(500, message);
		}
	}

	// Update lastActiveAt
	async updateLastActiveAt(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				lastActiveAt: new Date()
			});
			logger.debug(`Updated lastActiveAt for user: \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.updateLastActiveAt: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}

	// Set expiration date
	async setUserExpiration(user_id: string, expirationDate: Date): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				expiresAt: expirationDate
			});
			logger.debug(`Set expiration date for user: \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const message = `Error in UserAdapter.setUserExpiration: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, expirationDate });
			throw error(500, message);
		}
	}

	// check if a user is expired
	async isUserExpired(user_id: string): Promise<boolean> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (user && user.expiresAt) {
				return new Date(user.expiresAt) < new Date();
			}
			return false;
		} catch (err) {
			const message = `Error in UserAdapter.isUserExpired: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			throw error(500, message);
		}
	}
}
