/**
 * @file src/auth/mongoDBAuth/userAdapter.ts
 * @description MongoDB adapter for user-related operations.
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
import mongoose, { Schema, Document, Model } from 'mongoose';
import { roles as configRoles } from '@root/config/roles';

// Adapter
import { getPermissionByName, getAllPermissions } from '../permissionManager';

// Types
import type { Permission, Role, User } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import logger from '@utils/logger';

// Define the User schema
export const UserSchema = new Schema(
	{
		email: { type: String, required: true, unique: true }, // User's email, required field
		password: { type: String }, // User's password, optional field
		role: { type: String, required: true }, // User's role, required field
		permissions: [{ type: String }], // User-specific permissions as names, optional field
		username: String, // User's username, optional field
		firstName: String, // First name of the user
		lastName: String, // Last name of the user
		locale: String, // Locale of the user
		avatar: String, // URL of the user's avatar, optional field
		lastAuthMethod: String, // Last authentication method used by the user, optional field
		lastActiveAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Last time the user was active as Unix timestamp, optional field
		expiresAt: { type: Number }, // Expiry timestamp for the user in seconds, optional field
		isRegistered: Boolean, // Registration status of the user, optional field
		failedAttempts: { type: Number, default: 0 }, // Number of failed login attempts, optional field
		blocked: Boolean, // Whether the user is blocked, optional field
		resetRequestedAt: { type: Number }, // Last time the user requested a password reset as Unix timestamp, optional field
		resetToken: String, // Token for resetting the user's password, optional field
		lockoutUntil: { type: Number }, // Lockout timestamp for the user as Unix timestamp, optional field
		is2FAEnabled: Boolean // Whether the user has 2FA enabled, optional field
	},
	{
		timestamps: true // Automatically adds `createdAt` and `updatedAt` fields
	}
);

export class UserAdapter implements Partial<authDBInterface> {
	private UserModel: Model<User & Document>;

	constructor() {
		this.UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserSchema);
	}

	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const user = new this.UserModel(userData);
			await user.save();
			logger.info(`User created: ${user.email}`);
			const savedUser = user.toObject();
			savedUser._id = savedUser._id.toString();
			return savedUser as User;
		} catch (error) {
			logger.error(`Failed to create user: ${userData.email}`, { error });
			throw new Error(`Failed to create user: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
		}
	}

	// Edit a user
	async updateUserAttributes(user_id: string, userData: Partial<User>): Promise<User> {
		try {
			const user = await this.UserModel.findByIdAndUpdate(user_id, userData, { new: true }).lean();
			if (!user) {
				throw new Error(`User not found for ID: ${user_id}`);
			}
			user._id = user._id.toString();
			logger.debug(`User attributes updated: ${user_id}`);
			return user as User;
		} catch (error) {
			logger.error(`Failed to update user attributes for user ID: ${user_id}`, { error });
			throw new Error(`Failed to update user attributes: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
		}
	}

	// Assign a permission to a user
	async assignPermissionToUser(user_id: string, permissionName: string): Promise<void> {
		const permission = getPermissionByName(permissionName);
		if (!permission) {
			logger.warn(`Permission not found: ${permissionName}`);
			throw new Error('Permission not found');
		}
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $addToSet: { permissions: permissionName } });
			logger.info(`Permission ${permissionName} assigned to user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to assign permission to user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Remove a permission from a user
	async deletePermissionFromUser(user_id: string, permissionName: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $pull: { permissions: permissionName } });
			logger.info(`Permission ${permissionName} removed from user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to remove permission from user: ${(error as Error).message}`);
			throw error;
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

			logger.debug(`Permissions retrieved for user: ${user_id}`);
			return uniquePermissions;
		} catch (error) {
			logger.error(`Failed to get permissions for user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Check if a user has a specific permission
	async checkUserPermission(user_id: string, permissionName: string): Promise<boolean> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user) {
				logger.warn(`User not found: ${user_id}`);
				return false;
			}

			user._id = user._id.toString();
			const directPermissions = new Set(user.permissions || []);
			const hasDirectPermission = directPermissions.has(permissionName);
			if (hasDirectPermission) {
				return true;
			}

			logger.debug(`User ${user_id} does not have permission: ${permissionName}`);
			return false;
		} catch (error) {
			logger.error(`Failed to check user permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Change user password
	async changePassword(user_id: string, newPassword: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { password: newPassword });
			logger.info(`Password changed for user: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to change password: ${(error as Error).message}`);
			throw error;
		}
	}

	// Block a user
	async blockUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { blocked: true });
			logger.info(`User blocked: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to block user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Unblock a user
	async unblockUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { blocked: false });
			logger.info(`User unblocked: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to unblock user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete a user
	async deleteUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndDelete(user_id);
			logger.info(`User deleted: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to delete user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a user by ID
	async getUserById(user_id: string): Promise<User | null> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (user) {
				user._id = user._id.toString();
				logger.debug(`User retrieved by ID: ${user_id}`);
				return user as User;
			} else {
				return null;
			}
		} catch (error) {
			logger.error(`Failed to get user by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a user by email
	async getUserByEmail(email: string): Promise<User | null> {
		try {
			const user = await this.UserModel.findOne({ email }).lean();
			if (user) {
				user._id = user._id.toString();
				logger.debug(`User retrieved by email: ${email}`);
				return user as User;
			} else {
				return null;
			}
		} catch (error) {
			logger.error(`Failed to get user by email: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all users with optional filtering, sorting, and pagination
	async getAllUsers(options?: {
		limit?: number;
		skip?: number;
		sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][];
		filter?: Record<string, unknown>;
	}): Promise<User[]> {
		try {
			let query = this.UserModel.find(options?.filter || {}).lean();

			if (options?.sort) {
				query = query.sort(options.sort as any);
			}
			if (typeof options?.skip === 'number') {
				query = query.skip(options.skip);
			}
			if (typeof options?.limit === 'number') {
				query = query.limit(options.limit);
			}

			const users = await query.exec();
			logger.debug('All users retrieved');
			return users.map((user) => {
				user._id = user._id.toString();
				return user as User;
			});
		} catch (error) {
			logger.error(`Failed to get all users: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get the count of users
	async getUserCount(filter?: Record<string, unknown>): Promise<number> {
		try {
			const count = await this.UserModel.countDocuments(filter || {});
			logger.debug(`User count retrieved: ${count}`);
			return count;
		} catch (error) {
			logger.error(`Failed to get user count: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get users with a permission
	async getUsersWithPermission(permissionName: string): Promise<User[]> {
		try {
			const users = await this.UserModel.find({ permissions: permissionName }).lean();
			logger.debug(`Users with permission ${permissionName} retrieved`);
			return users.map((user) => {
				user._id = user._id.toString();
				return user as User;
			});
		} catch (error) {
			logger.error(`Failed to get users with permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Assign a role to a user
	async assignRoleToUser(user_id: string, role: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { role });
			logger.info(`Role ${role} assigned to user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to assign role to user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Remove a role from a user
	async removeRoleFromUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $unset: { role: '' } });
			logger.info(`Role removed from user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to remove role from user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get roles for a user
	async getRolesForUser(user_id: string): Promise<Role[]> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user || !user.role) {
				logger.warn(`User or role not found for user ID: ${user_id}`);
				return [];
			}

			user._id = user._id.toString();
			// Fetch the role from the file-based roles configuration
			const role = configRoles.find((r) => r._id === user.role);
			if (!role) {
				logger.warn(`Role not found: ${user.role} for user ID: ${user_id}`);
				return [];
			}

			logger.debug(`Roles retrieved for user ID: ${user_id}`);
			return [role];
		} catch (error) {
			logger.error(`Failed to get roles for user: ${(error as Error).message}`);
			throw error;
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
		} catch (error) {
			logger.error(`Failed to retrieve recent user activities: ${(error as Error).message}`);
			throw error;
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
		} catch (error) {
			logger.error(`Failed to check user role: ${(error as Error).message}`);
			throw error;
		}
	}
}
