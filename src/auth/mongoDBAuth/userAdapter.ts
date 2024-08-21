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

// Adapter
import { RoleSchema } from './roleAdapter';
import { PermissionSchema } from '../permissionAdapter';
// import { TokenAdapter } from './tokenAdapter';

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
		permissions: [{ type: Schema.Types.ObjectId, ref: 'Permission' }], // User-specific permissions, optional field
		username: String, // User's username, optional field
		firstName: String, // First name of the user
		lastName: String, // Last name of the user
		locale: String, // Locale of the user
		avatar: String, // URL of the user's avatar, optional field
		lastAuthMethod: String, // Last authentication method used by the user, optional field
		lastActiveAt: { type: Date, default: Date.now }, // Last time the user was active, optional field
		expiresAt: Date, // Expiry date for the user, optional field
		isRegistered: Boolean, // Registration status of the user, optional field
		failedAttempts: { type: Number, default: 0 }, // Number of failed login attempts, optional field
		blocked: Boolean, // Whether the user is blocked, optional field
		resetRequestedAt: Date, // Last time the user requested a password reset, optional field
		resetToken: String, // Token for resetting the user's password, optional field
		lockoutUntil: Date, // Lockout date for the user, optional field
		is2FAEnabled: Boolean // Whether the user has 2FA enabled, optional field
	},
	{ timestamps: true }
);

export class UserAdapter implements Partial<authDBInterface> {
	private UserModel: Model<User & Document>;
	private RoleModel: Model<Role & Document>;
	private PermissionModel: Model<Permission & Document>;

	constructor() {
		// Create the models if they don't exist
		this.UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserSchema);
		this.RoleModel = mongoose.models.auth_roles || mongoose.model<Role & Document>('auth_roles', RoleSchema);
		this.PermissionModel = mongoose.models.auth_permissions || mongoose.model<Permission & Document>('auth_permissions', PermissionSchema);
	}

	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const user = new this.UserModel(userData);
			await user.save();
			logger.info(`User created: ${user.email}`);
			return user.toObject() as User;
		} catch (error) {
			logger.error(`Failed to create user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Edit a user
	async updateUserAttributes(userId: string, userData: Partial<User>): Promise<User> {
		try {
			const user = await this.UserModel.findByIdAndUpdate(userId, userData, { new: true });
			if (!user) {
				throw new Error('User not found');
			}
			logger.debug(`User attributes updated: ${userId}`);
			return user.toObject() as User;
		} catch (error) {
			logger.error(`Failed to edit user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Change user password
	async changePassword(userId: string, newPassword: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(userId, { password: newPassword });
			logger.info(`Password changed for user: ${userId}`);
		} catch (error) {
			logger.error(`Failed to change password: ${(error as Error).message}`);
			throw error;
		}
	}

	// Add a new user
	async addUser(userData: Partial<User>, expirationTime: number): Promise<{ user: User; token: string }> {
		try {
			const user = await this.createUser(userData);
			const token = await tokenAdapter.createToken({
				user_id: user._id,
				email: user.email!,
				expires: expirationTime,
				type: 'user'
			});
			return { user, token };
		} catch (error) {
			logger.error(`Failed to add user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Block a user
	async blockUser(userId: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(userId, { blocked: true });
			logger.info(`User blocked: ${userId}`);
		} catch (error) {
			logger.error(`Failed to block user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Unblock a user
	async unblockUser(userId: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(userId, { blocked: false });
			logger.info(`User unblocked: ${userId}`);
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
			const user = await this.UserModel.findById(user_id);
			logger.debug(`User retrieved by ID: ${user_id}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			logger.error(`Failed to get user by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a user by email
	async getUserByEmail(email: string): Promise<User | null> {
		try {
			const user = await this.UserModel.findOne({ email });
			logger.debug(`User retrieved by email: ${email}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			logger.error(`Failed to get user by email: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all users with optional filtering, sorting, and pagination
	async getAllUsers(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<User[]> {
		try {
			let query = this.UserModel.find(options?.filter || {});

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
			return users.map((user) => user.toObject() as User);
		} catch (error) {
			logger.error(`Failed to get all users: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get the count of users
	async getUserCount(filter?: object): Promise<number> {
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
	async getUsersWithPermission(permission_id: string): Promise<User[]> {
		try {
			const users = await this.UserModel.find({ permissions: permission_id });
			return users.map((user) => user.toObject() as User);
		} catch (error) {
			logger.error(`Failed to get users with permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Assign a role to a user
	async assignRoleToUser(user_id: string, role: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { role: role });
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
			const user = await this.UserModel.findById(user_id);
			if (!user) {
				return [];
			}
			const role = await this.RoleModel.findOne({ name: user.role });
			return role ? [role] : [];
		} catch (error) {
			logger.error(`Failed to get roles for user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get permissions for a user
	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		try {
			const user = await this.UserModel.findById(user_id).populate('permissions');
			if (!user) return [];

			const directPermissions = (user.permissions as Permission[]) || [];
			const role = await this.RoleModel.findOne({ name: user.role }).populate({
				path: 'permissions',
				model: this.PermissionModel
			});
			const rolePermissions = (role?.permissions as unknown as Permission[]) || [];

			const allPermissions = [...directPermissions, ...rolePermissions];
			const uniquePermissions = Array.from(new Set(allPermissions.map((p) => p._id.toString())))
				.map((_id) => allPermissions.find((p) => p._id.toString() === _id))
				.filter((p): p is Permission => p !== undefined);

			return uniquePermissions;
		} catch (error) {
			logger.error(`Failed to get permissions for user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Assign a permission to a user
	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $addToSet: { permissions: permission_id } });
			logger.info(`Permission ${permission_id} assigned to user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to assign permission to user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Remove a permission from a user
	async removePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $pull: { permissions: permission_id } });
			logger.info(`Permission ${permission_id} removed from user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to remove permission from user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Check user permission
	async checkUserPermission(user_id: string, permission_name: string): Promise<boolean> {
		try {
			const user = await this.UserModel.findById(user_id).populate('permissions');
			if (!user) return false;

			// Check direct permissions
			const userPermissions = user.permissions as unknown as Permission[];
			if (userPermissions?.some((p) => p.name === permission_name)) return true;

			// Check role-based permissions
			const role = await this.RoleModel.findOne({ name: user.role }).populate('permissions');
			if (!role) return false;

			const rolePermissions = role.permissions as unknown as Permission[];
			if (rolePermissions?.some((p) => p.name === permission_name)) return true;

			return false;
		} catch (error) {
			logger.error(`Failed to check user permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// Check user role
	async checkUserRole(user_id: string, role_name: string): Promise<boolean> {
		try {
			const user = await this.UserModel.findById(user_id);
			return user?.role === role_name;
		} catch (error) {
			logger.error(`Failed to check user role: ${(error as Error).message}`);
			throw error;
		}
	}

	// Fetch the last 5 users who logged in
	async getRecentUserActivities(): Promise<User[]> {
		try {
			// Fetch users sorted by lastActiveAt in descending order and limit to 5
			const recentUsers = await this.UserModel.find({ lastActiveAt: { $ne: null } })
				.sort({ lastActiveAt: -1 })
				.limit(5)
				.select('email username lastActiveAt') // Select the fields you want to return
				.lean();

			logger.debug('Retrieved recent user activities');
			return recentUsers as User[];
		} catch (error) {
			logger.error(`Failed to retrieve recent user activities: ${(error as Error).message}`);
			throw error;
		}
	}
}
