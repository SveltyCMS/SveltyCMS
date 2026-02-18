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

// Types
import type { Permission, Role, User } from '@src/databases/auth';
// Adapter
import { getAllPermissions } from '@src/databases/auth/permissions';
import type { DatabaseResult, PaginationOption } from '@src/databases/dbInterface';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import { getPrivateSettingSync } from '@src/services/settingsService';
// System Logging
import { logger } from '@utils/logger';
import type { Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Define the User schema
export const UserSchema = new Schema(
	{
		_id: { type: String, required: true }, // UUID as primary key
		email: { type: String, required: true, unique: true }, // User's email, required field
		tenantId: { type: String }, // Tenant identifier for multi-tenancy, indexed via compound indexes
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
		is2FAEnabled: Boolean, // Whether the user has 2FA enabled, optional field
		totpSecret: String, // TOTP secret for 2FA (base32 encoded), optional field
		backupCodes: [String], // Array of hashed backup codes for 2FA recovery, optional field
		last2FAVerification: { type: Date } // Timestamp of last successful 2FA verification, optional field
	},
	{
		timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields
		collection: 'auth_users', // Explicitly set the collection name to match model registration
		_id: false // Disable auto ObjectId generation - we provide our own UUID
	}
);

// --- Indexes ---
// Compound indexes for common query patterns (50-80% performance boost)
UserSchema.index({ tenantId: 1, email: 1 }); // Multi-tenant user lookup (most common)
UserSchema.index({ tenantId: 1, role: 1, blocked: 1 }); // Role-based queries per tenant
UserSchema.index({ tenantId: 1, username: 1 }, { sparse: true }); // Username lookup (if exists)
UserSchema.index({ tenantId: 1, lastActiveAt: -1 }); // Recent user activity queries
UserSchema.index({ resetToken: 1 }, { sparse: true, expireAfterSeconds: 3600 }); // Password reset tokens (auto-cleanup after 1hr)
UserSchema.index({ expiresAt: 1 }, { sparse: true, expireAfterSeconds: 0 }); // TTL for temporary users
UserSchema.index({ lockoutUntil: 1 }, { sparse: true }); // Lockout management
UserSchema.index({ role: 1, blocked: 1, isRegistered: 1 }); // Admin user management queries
UserSchema.index({ email: 1, lastAuthMethod: 1 }); // Auth method tracking

import { toISOString } from '@src/utils/dateUtils';

/**
 * UserAdapter class handles all user-related database operations.
 * This is a partial implementation that will be composed with other adapters.
 */
export class UserAdapter {
	private readonly UserModel: Model<User>;

	// Map MongoDB user to User type with ISO strings for dates
	private mapUser(user: any): User {
		if (!user) {
			return user;
		}
		const result = { ...user };
		result._id = result._id.toString();

		// Convert all date fields to ISO strings
		if (result.lastActiveAt) {
			result.lastActiveAt = toISOString(result.lastActiveAt);
		}
		if (result.expiresAt) {
			result.expiresAt = toISOString(result.expiresAt);
		}
		if (result.resetRequestedAt) {
			result.resetRequestedAt = toISOString(result.resetRequestedAt);
		}
		if (result.lockoutUntil) {
			result.lockoutUntil = toISOString(result.lockoutUntil);
		}
		if (result.last2FAVerification) {
			result.last2FAVerification = toISOString(result.last2FAVerification);
		}
		if (result.createdAt) {
			result.createdAt = toISOString(result.createdAt);
		}
		if (result.updatedAt) {
			result.updatedAt = toISOString(result.updatedAt);
		}

		// Ensure permissions are strings
		if (result.permissions && Array.isArray(result.permissions)) {
			result.permissions = result.permissions.map((p: any) => String(p));
		}

		return result as User;
	}

	constructor() {
		this.UserModel = mongoose.models?.auth_users || mongoose.model<User>('auth_users', UserSchema);
	}

	// Create a new user
	async createUser(userData: Partial<User>): Promise<DatabaseResult<User>> {
		try {
			// Normalize email to lowercase if present
			const normalizedUserData = {
				...userData,
				email: userData.email?.toLowerCase()
			};

			// Log exactly what we received (redacted)
			logger.debug('UserAdapter.createUser received data:', {
				...normalizedUserData,
				email: '[REDACTED]',
				password: '[REDACTED]',
				avatar: `Avatar value: "${normalizedUserData.avatar}" (type: ${typeof normalizedUserData.avatar}, length: ${normalizedUserData.avatar?.length || 0})`
			});

			// Generate UUID for the user
			const userId = generateId();
			const user = new this.UserModel({ ...normalizedUserData, _id: userId }); // Log what the model contains before saving
			logger.debug('UserModel before save:', {
				email: '[REDACTED]',
				avatar: `Model avatar: "${user.avatar}" (type: ${typeof user.avatar})`,
				hasAvatar: !!user.avatar
			});

			await user.save();

			// Log what was actually saved
			logger.debug('User created and saved:', {
				_id: user._id,
				email: '[REDACTED]',
				avatar: `Saved avatar: "${user.avatar}" (type: ${typeof user.avatar})`,
				allFields: Object.keys(user.toObject())
			});

			const savedUser = user.toObject();
			return {
				success: true,
				data: this.mapUser(savedUser)
			};
		} catch (err) {
			const message = `Error in UserAdapter.createUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				email: '[REDACTED]',
				error: err,
				userData: Object.keys(userData)
			});
			return {
				success: false,
				message,
				error: {
					code: 'CREATE_USER_ERROR',
					message
				}
			};
		}
	}

	// Edit a user
	async updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>> {
		try {
			const filter: Record<string, unknown> = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const user = await this.UserModel.findOneAndUpdate(filter, userData, { returnDocument: 'after' }).lean();

			if (!user) {
				return {
					success: false,
					message: `User not found for ID: ${user_id} ${tenantId ? `in tenant: ${tenantId}` : ''}`,
					error: {
						code: 'USER_NOT_FOUND',
						message: `User not found for ID: ${user_id} ${tenantId ? `in tenant: ${tenantId}` : ''}`
					}
				};
			}

			logger.debug(`User attributes updated: ${user_id}`, { tenantId });
			return {
				success: true,
				data: this.mapUser(user)
			};
		} catch (err) {
			const message = `Error in UserAdapter.updateUserAttributes: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'UPDATE_USER_ERROR',
					message
				}
			};
		}
	}

	// Get all users with optional filtering, sorting, and pagination
	async getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>> {
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
			const mappedUsers = users.map((user) => this.mapUser(user));
			return {
				success: true,
				data: mappedUsers
			};
		} catch (err) {
			const message = `Error in UserAdapter.getAllUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { options });
			return {
				success: false,
				message,
				error: {
					code: 'GET_ALL_USERS_ERROR',
					message
				}
			};
		}
	}

	// Get the count of users
	async getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>> {
		try {
			const count = await this.UserModel.countDocuments(filter || {});
			logger.debug(`User count retrieved: ${count}`);
			return {
				success: true,
				data: count
			};
		} catch (err) {
			const message = `Error in UserAdapter.getUserCount: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { filter });
			return {
				success: false,
				message,
				error: {
					code: 'GET_USER_COUNT_ERROR',
					message
				}
			};
		}
	}

	// Get users with a permission
	async getUsersWithPermission(permissionName: string): Promise<DatabaseResult<User[]>> {
		try {
			const users = await this.UserModel.find({ permissions: permissionName }).lean();
			logger.debug(`Users with permission ${permissionName} retrieved`);
			const mappedUsers = users.map((user) => this.mapUser(user));
			return {
				success: true,
				data: mappedUsers
			};
		} catch (err) {
			const message = `Error in UserAdapter.getUsersWithPermission: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'GET_USERS_WITH_PERMISSION_ERROR',
					message
				}
			};
		}
	}

	// Assign a permission to a user
	async assignPermissionToUser(user_id: string, permissionName: string): Promise<DatabaseResult<void>> {
		const allPermissions = await getAllPermissions();
		const permission = allPermissions.find((p) => p._id === permissionName);
		if (!permission) {
			logger.warn(`Permission not found: ${permissionName}`);
			return {
				success: false,
				message: `Permission not found: ${permissionName}`,
				error: {
					code: 'PERMISSION_NOT_FOUND',
					message: `Permission not found: ${permissionName}`
				}
			};
		}
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $addToSet: { permissions: permissionName } });
			logger.info(`Permission ${permissionName} assigned to user${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.assignPermissionToUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'ASSIGN_PERMISSION_ERROR',
					message
				}
			};
		}
	}

	// Remove a permission from a user
	async deletePermissionFromUser(user_id: string, permissionName: string): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $pull: { permissions: permissionName } });
			logger.info(`Permission ${permissionName} removed from user ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.deletePermissionFromUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_PERMISSION_ERROR',
					message
				}
			};
		}
	}

	// Get permissions for a user
	async getPermissionsForUser(user_id: string): Promise<DatabaseResult<Permission[]>> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user) {
				logger.warn(`User not found: ${user_id}`);
				return {
					success: true,
					data: []
				};
			}

			const directPermissions = new Set(user.permissions || []);
			const allPermissions = await getAllPermissions();
			const userPermissions = allPermissions.filter((perm) => directPermissions.has(perm._id));

			const uniquePermissions = Array.from(new Set(userPermissions.map((p) => p._id))).map((id) =>
				userPermissions.find((p) => p._id === id)
			) as Permission[];

			logger.debug(`Permissions retrieved for user: ${user_id}`);
			return {
				success: true,
				data: uniquePermissions
			};
		} catch (err) {
			const message = `Error in UserAdapter.getPermissionsForUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'GET_PERMISSIONS_ERROR',
					message
				}
			};
		}
	}

	// Check if a user has a specific permission
	async hasPermissionByAction(user_id: string, permissionName: string): Promise<DatabaseResult<boolean>> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user) {
				logger.warn(`User not found: ${user_id}`);
				return {
					success: true,
					data: false
				};
			}

			const directPermissions = new Set(user.permissions || []);
			const hasDirectPermission = directPermissions.has(permissionName);
			if (hasDirectPermission) {
				return {
					success: true,
					data: true
				};
			}

			logger.debug(`User ${user_id} does not have permission: ${permissionName}`);
			return {
				success: true,
				data: false
			};
		} catch (err) {
			const message = `Error in UserAdapter.hasPermissionByAction: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'HAS_PERMISSION_ERROR',
					message
				}
			};
		}
	}

	// Change user password
	async changePassword(user_id: string, newPassword: string): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { password: newPassword });
			logger.info(`Password changed for user: ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.changePassword: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'CHANGE_PASSWORD_ERROR',
					message
				}
			};
		}
	}

	// Block a user
	async blockUser(user_id: string): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				blocked: true,
				lockoutUntil: new Date() // Set lockoutUntil to current time
			});
			logger.info(`User blocked: ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.blockUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'BLOCK_USER_ERROR',
					message
				}
			};
		}
	}

	// Unblock a user
	async unblockUser(user_id: string): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				blocked: false,
				lockoutUntil: null // Clear lockoutUntil
			});
			logger.info(`User unblocked: ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.unblockUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'UNBLOCK_USER_ERROR',
					message
				}
			};
		}
	}

	// Block multiple users
	async blockUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			const filter: Record<string, unknown> = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const result = await this.UserModel.updateMany(filter, {
				blocked: true,
				lockoutUntil: new Date() // Set lockoutUntil to current time
			});
			logger.info(`Users blocked: ${userIds.join(', ')}`, { tenantId });
			return {
				success: true,
				data: { modifiedCount: result.modifiedCount }
			};
		} catch (err) {
			const message = `Error in UserAdapter.blockUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'BLOCK_USERS_ERROR',
					message
				}
			};
		}
	}

	// Unblock multiple users
	async unblockUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			const filter: Record<string, unknown> = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const result = await this.UserModel.updateMany(filter, {
				blocked: false,
				lockoutUntil: null // Clear lockoutUntil
			});
			logger.info(`Users unblocked: ${userIds.join(', ')}`, { tenantId });
			return {
				success: true,
				data: { modifiedCount: result.modifiedCount }
			};
		} catch (err) {
			const message = `Error in UserAdapter.unblockUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'UNBLOCK_USERS_ERROR',
					message
				}
			};
		}
	}

	// Delete a user
	async deleteUser(user_id: string, tenantId?: string): Promise<DatabaseResult<void>> {
		try {
			const filter: Record<string, unknown> = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			await this.UserModel.findOneAndDelete(filter);
			logger.info(`User deleted: ${user_id}`, { tenantId });
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.deleteUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_USER_ERROR',
					message
				}
			};
		}
	}

	// Delete multiple users
	async deleteUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>> {
		try {
			const filter: Record<string, unknown> = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const result = await this.UserModel.deleteMany(filter);
			logger.info(`Users deleted: ${userIds.join(', ')}`, { tenantId });
			return {
				success: true,
				data: { deletedCount: result.deletedCount }
			};
		} catch (err) {
			const message = `Error in UserAdapter.deleteUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_USERS_ERROR',
					message
				}
			};
		}
	}

	// Get a user by ID
	async getUserById(user_id: string, tenantId?: string): Promise<DatabaseResult<User | null>> {
		try {
			const filter: Record<string, unknown> = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const user = await this.UserModel.findOne(filter).lean();
			if (user) {
				logger.debug(`User retrieved by ID: ${user_id}`, {
					tenantId: tenantId || 'none (single-tenant mode)'
				});
				return {
					success: true,
					data: this.mapUser(user)
				};
			}
			return {
				success: true,
				data: null
			};
		} catch (err) {
			const message = `Error in UserAdapter.getUserById: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				user_id,
				tenantId: tenantId || 'none (single-tenant mode)'
			});
			return {
				success: false,
				message,
				error: {
					code: 'GET_USER_BY_ID_ERROR',
					message
				}
			};
		}
	} // Get a user by email
	async getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>> {
		try {
			if (!criteria.email || typeof criteria.email !== 'string') {
				logger.error('getUserByEmail called with invalid email:', { email: criteria.email, tenantId: criteria.tenantId });
				return {
					success: true,
					data: null
				};
			}
			const normalizedEmail = criteria.email.toLowerCase();
			const filter: Record<string, unknown> = { email: normalizedEmail };
			if (criteria.tenantId) {
				filter.tenantId = criteria.tenantId;
			}

			const user = await this.UserModel.findOne(filter).lean();
			if (user) {
				logger.debug('User retrieved by email:', {
					email: '[REDACTED]',
					tenantId: criteria.tenantId || 'none (single-tenant mode)'
				});
				return {
					success: true,
					data: this.mapUser(user)
				};
			}
			return {
				success: true,
				data: null
			};
		} catch (err) {
			const message = `Error in UserAdapter.getUserByEmail: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				email: '[REDACTED]',
				tenantId: criteria.tenantId || 'none (single-tenant mode)'
			});
			return {
				success: false,
				message,
				error: {
					code: 'GET_USER_BY_EMAIL_ERROR',
					message
				}
			};
		}
	}

	// Assign a role to a user
	async assignRoleToUser(user_id: string, role: string): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { role });
			logger.info(`Role ${role} assigned to user ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.assignRoleToUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, role });
			return {
				success: false,
				message,
				error: {
					code: 'ASSIGN_ROLE_ERROR',
					message
				}
			};
		}
	}

	// Remove a role from a user
	async removeRoleFromUser(user_id: string): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $unset: { role: '' } });
			logger.info(`Role removed from user ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.removeRoleFromUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'REMOVE_ROLE_ERROR',
					message
				}
			};
		}
	}

	// Get roles for a user
	async getRolesForUser(user_id: string): Promise<DatabaseResult<Role[]>> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user?.role) {
				logger.warn(`User or role not found for user ID: ${user_id}`);
				return {
					success: true,
					data: []
				};
			}

			user._id = user._id.toString();
			// Fetch the role from the file-based roles configuration
			const role = getPrivateSettingSync('ROLES')?.find((r) => r._id === user.role);
			if (!role) {
				logger.warn(`Role not found: ${user.role} for user ID: ${user_id}`);
				return {
					success: true,
					data: []
				};
			}

			logger.debug(`Roles retrieved for user ID: ${user_id}`);
			return {
				success: true,
				data: [role]
			};
		} catch (err) {
			const message = `Error in UserAdapter.getRolesForUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'GET_ROLES_ERROR',
					message
				}
			};
		}
	}

	// Fetch the last 5 users who logged in
	async getRecentUserActivities(): Promise<DatabaseResult<User[]>> {
		try {
			const recentUsers = await this.UserModel.find({ lastActiveAt: { $ne: null } })
				.sort({ lastActiveAt: -1 })
				.limit(5)
				.select('email username lastActiveAt')
				.lean();

			logger.debug('Retrieved recent user activities');
			const mappedUsers = recentUsers.map((user) => {
				user._id = user._id.toString();
				return user as User;
			});
			return {
				success: true,
				data: mappedUsers
			};
		} catch (err) {
			const message = `Error in UserAdapter.getRecentUserActivities: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'GET_RECENT_ACTIVITIES_ERROR',
					message
				}
			};
		}
	}

	// Check user role
	async checkUserRole(user_id: string, role_name: string): Promise<DatabaseResult<boolean>> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (user) {
				user._id = user._id.toString();
				return {
					success: true,
					data: user.role === role_name
				};
			}
			return {
				success: true,
				data: false
			};
		} catch (err) {
			const message = `Error in UserAdapter.checkUserRole: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, role_name });
			return {
				success: false,
				message,
				error: {
					code: 'CHECK_USER_ROLE_ERROR',
					message
				}
			};
		}
	}

	// Update lastActiveAt
	async updateLastActiveAt(user_id: string): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				lastActiveAt: new Date()
			});
			logger.debug(`Updated lastActiveAt for user: ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.updateLastActiveAt: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'UPDATE_LAST_ACTIVE_ERROR',
					message
				}
			};
		}
	}

	// Set expiration date
	async setUserExpiration(user_id: string, expirationDate: Date): Promise<DatabaseResult<void>> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				expiresAt: expirationDate
			});
			logger.debug(`Set expiration date for user: ${user_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in UserAdapter.setUserExpiration: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, expirationDate });
			return {
				success: false,
				message,
				error: {
					code: 'SET_USER_EXPIRATION_ERROR',
					message
				}
			};
		}
	}

	// check if a user is expired
	async isUserExpired(user_id: string): Promise<DatabaseResult<boolean>> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (user?.expiresAt) {
				return {
					success: true,
					data: new Date(user.expiresAt) < new Date()
				};
			}
			return {
				success: true,
				data: false
			};
		} catch (err) {
			const message = `Error in UserAdapter.isUserExpired: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'IS_USER_EXPIRED_ERROR',
					message
				}
			};
		}
	}
}
