import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

// Import logger
import { logger } from '@src/utils/logger';

// Import types
import type { authDBInterface } from './authDBInterface';
import type { User, Session, Token, Role, Permission } from './types';

// Schema for User collection
const UserSchema = new Schema(
	{
		email: { type: String, required: true }, // User's email, required field
		password: String, // User's password, optional field
		role: { type: String, required: true }, // User's role, required field
		username: String, // User's username, optional field
		firstName: String, // First name of the user
		lastName: String, // Last name of the user
		locale: String, // Locale of the user
		avatar: String, // URL of the user's avatar, optional field
		lastAuthMethod: String, // Last authentication method used by the user, optional field
		lastActiveAt: Date, // Last time the user was active, optional field
		expiresAt: Date, // Expiry date for the user, optional field
		isRegistered: Boolean, // Registration status of the user, optional field
		blocked: Boolean, // Whether the user is blocked, optional field
		resetRequestedAt: Date, // Last time the user requested a password reset, optional field
		resetToken: String, // Token for resetting the user's password, optional field
		is2FAEnabled: Boolean, // Whether the user has 2FA enabled, optional field
		permissions: [{ type: Schema.Types.ObjectId, ref: 'Permission' }] // User-specific permissions, optional field
	},
	{ timestamps: true }
);

// Schema for Session collection
const SessionSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the session, required field
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
);

// Schema for Token collection
const TokenSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the token, required field
		token: { type: String, required: true }, // Token string, required field
		email: { type: String, required: true }, // Email associated with the token, required field
		expires: { type: Date, required: true } // Expiry date of the token, required field
	},
	{ timestamps: true }
);

// Schema for Role collection
const RoleSchema = new Schema(
	{
		name: { type: String, required: true }, // Name of the role, required field
		description: String, // Description of the role, optional field
		permissions: [{ type: Schema.Types.ObjectId, ref: 'Permission' }] // Permissions associated with the role, optional field
	},
	{ timestamps: true }
);

// Schema for Permission collection
const PermissionSchema = new Schema(
	{
		name: { type: String, required: true }, // Name of the permission, required field
		description: String, // Description of the permission, optional field
		contextId: { type: String, required: true }, // ID of the context associated with the permission, required field
		contextType: { type: String, required: true }, // Type of the context associated with the permission, required field
		requires2FA: Boolean // Whether the permission requires 2FA, optional field
	},
	{ timestamps: true }
);

// Check and create models only if they don't exist
const UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserSchema);
const SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionSchema);
const TokenModel = mongoose.models.auth_tokens || mongoose.model<Token & Document>('auth_tokens', TokenSchema);
const RoleModel = mongoose.models.auth_roles || mongoose.model<Role & Document>('auth_roles', RoleSchema);
const PermissionModel = mongoose.models.auth_permissions || mongoose.model<Permission & Document>('auth_permissions', PermissionSchema);

// Export schemas for use in other files
export { UserSchema, SessionSchema, TokenSchema, RoleSchema, PermissionSchema, UserModel };

// MongoDBAuthAdapter class implementing AuthDBAdapter interface
export class MongoDBAuthAdapter implements authDBInterface {
	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const user = new UserModel(userData);
			await user.save();
			logger.info(`User created: ${user.email}`);
			// Return the user with the correct user_id field
			return {
				...user.toObject(),
				user_id: user._id.toString() // Ensure user_id is set correctly
			} as User;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to create user: ${error.message}`);
			} else {
				logger.error('Failed to create user: Unknown error');
			}
			throw error;
		}
	}

	// Update attributes of an existing user
	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<User> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $set: attributes });
			logger.debug(`User attributes updated: ${user_id}`);
			// Return the updated user
			const user = await this.getUserById(user_id);
			if (!user) {
				throw new Error('User not found');
			}
			return user;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to update user attributes: ${error.message}`);
			} else {
				logger.error('Failed to update user attributes: Unknown error');
			}
			throw error;
		}
	}

	// Delete a user by ID
	async deleteUser(user_id: string): Promise<void> {
		try {
			await UserModel.deleteOne({ _id: user_id });
			logger.info(`User deleted: ${user_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to delete user: ${error.message}`);
			} else {
				logger.error('Failed to delete user: Unknown error');
			}
			throw error;
		}
	}

	// Get a user by ID
	async getUserById(user_id: string): Promise<User | null> {
		try {
			const user = await UserModel.findById(user_id);
			logger.debug(`User retrieved by ID: ${user_id}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get user by ID: ${error.message}`);
			} else {
				logger.error('Failed to get user by ID: Unknown error');
			}
			throw error;
		}
	}

	// Get a user by email
	async getUserByEmail(email: string): Promise<User | null> {
		try {
			const user = await UserModel.findOne({ email });
			logger.debug(`User retrieved by email: ${email}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get user by email: ${error.message}`);
			} else {
				logger.error('Failed to get user by email: Unknown error');
			}
			throw error;
		}
	}

	// Get all users
	async getAllUsers(): Promise<User[]> {
		try {
			const users = await UserModel.find();
			logger.debug('All users retrieved');
			return users.map((user) => user.toObject() as User);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get all users: ${error.message}`);
			} else {
				logger.error('Failed to get all users: Unknown error');
			}
			throw error;
		}
	}

	// Get the total number of users
	async getUserCount(): Promise<number> {
		try {
			const count = await UserModel.countDocuments();
			logger.debug(`User count retrieved: ${count}`);
			return count;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get user count: ${error.message}`);
			} else {
				logger.error('Failed to get user count: Unknown error');
			}
			throw error;
		}
	}

	// Create a new session for a user
	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		try {
			const expiresAt = new Date(Date.now() + data.expires);
			const session = new SessionModel({
				user_id: data.user_id,
				expires: expiresAt
			});
			await session.save();
			logger.debug(`Session created for user: ${data.user_id}, expires at: ${expiresAt}`);
			return {
				session_id: session._id.toString(),
				user_id: session.user_id,
				expires: session.expires
			} as Session;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to create session: ${error.message}`);
			} else {
				logger.error('Failed to create session: Unknown error');
			}
			throw error;
		}
	}

	// Destroy a session by ID
	async destroySession(session_id: string): Promise<void> {
		try {
			await SessionModel.deleteOne({ _id: session_id });
			logger.debug(`Session destroyed: ${session_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to destroy session: ${error.message}`);
			} else {
				logger.error('Failed to destroy session: Unknown error');
			}
			throw error;
		}
	}

	// Validate a session by ID
	async validateSession(session_id: string): Promise<User | null> {
		try {
			const session = await SessionModel.findById(session_id);
			if (!session || session.expires <= new Date()) {
				if (session) await SessionModel.deleteOne({ _id: session_id });
				logger.warn(`Session invalid or expired: ${session_id}`);
				return null;
			}
			const user = await UserModel.findById(session.user_id);
			logger.debug(`Session validated for user: ${session.user_id}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to validate session: ${error.message}`);
			} else {
				logger.error('Failed to validate session: Unknown error');
			}
			throw error;
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await SessionModel.deleteMany({ user_id });
			logger.debug(`All sessions invalidated for user: ${user_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to invalidate all sessions: ${error.message}`);
			} else {
				logger.error('Failed to invalidate all sessions: Unknown error');
			}
			throw error;
		}
	}

	// Create a new token for a user
	async createToken(data: { user_id: string; email: string; expires: number }): Promise<string> {
		try {
			const tokenString = crypto.randomBytes(16).toString('hex'); // Generate a secure token string
			const token = new TokenModel({
				user_id: data.user_id,
				token: tokenString,
				email: data.email,
				expires: new Date(Date.now() + data.expires) // Calculate the expiration time from the current time
			});
			await token.save();
			logger.debug(`Token created for user: ${data.user_id}`);
			return tokenString; // Return the newly created token string
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to create token: ${error.message}`);
			} else {
				logger.error('Failed to create token: Unknown error');
			}
			throw error;
		}
	}

	// Validate a token
	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		try {
			const tokenDoc = await TokenModel.findOne({ token, user_id });
			if (tokenDoc) {
				const message = tokenDoc.expires > new Date() ? 'Token is valid' : 'Token is expired';
				logger.debug(`Token validation result for user: ${user_id}, message: ${message}`);
				return { success: tokenDoc.expires > new Date(), message };
			} else {
				const message = 'Token does not exist';
				logger.warn(`Token validation result for user: ${user_id}, message: ${message}`);
				return { success: false, message };
			}
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to validate token: ${error.message}`);
			} else {
				logger.error('Failed to validate token: Unknown error');
			}
			throw error;
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		try {
			const tokenDoc = await TokenModel.findOneAndDelete({ token, user_id });
			if (tokenDoc) {
				const message = tokenDoc.expires > new Date() ? 'Token is valid' : 'Token is expired';
				logger.debug(`Token consumed for user: ${user_id}, message: ${message}`);
				return { status: tokenDoc.expires > new Date(), message };
			} else {
				const message = 'Token does not exist';
				logger.warn(`Token consumption result for user: ${user_id}, message: ${message}`);
				return { status: false, message };
			}
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to consume token: ${error.message}`);
			} else {
				logger.error('Failed to consume token: Unknown error');
			}
			throw error;
		}
	}

	// Get all tokens
	async getAllTokens(): Promise<Token[]> {
		try {
			const tokens = await TokenModel.find();
			logger.debug('All tokens retrieved');
			return tokens.map((token) => token.toObject() as Token);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get all tokens: ${error.message}`);
			} else {
				logger.error('Failed to get all tokens: Unknown error');
			}
			throw error;
		}
	}

	// Create a new role
	async createRole(roleData: Role): Promise<Role> {
		try {
			const role = new RoleModel(roleData);
			await role.save();
			logger.debug(`Role created: ${role.name}`);
			return role.toObject() as Role;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to create role: ${error.message}`);
			} else {
				logger.error('Failed to create role: Unknown error');
			}
			throw error;
		}
	}

	// Update a role
	async updateRole(role_id: string, roleData: Partial<Role>): Promise<void> {
		try {
			await RoleModel.updateOne({ _id: role_id }, { $set: roleData });
			logger.debug(`Role updated: ${role_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to update role: ${error.message}`);
			} else {
				logger.error('Failed to update role: Unknown error');
			}
			throw error;
		}
	}

	// Delete a role
	async deleteRole(role_id: string): Promise<void> {
		try {
			await RoleModel.deleteOne({ _id: role_id });
			logger.debug(`Role deleted: ${role_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to delete role: ${error.message}`);
			} else {
				logger.error('Failed to delete role: Unknown error');
			}
			throw error;
		}
	}

	// Get a role by ID
	async getRoleById(role_id: string): Promise<Role | null> {
		try {
			const role = await RoleModel.findById(role_id).populate('permissions');
			logger.debug(`Role retrieved by ID: ${role_id}`);
			return role ? (role.toObject() as Role) : null;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get role by ID: ${error.message}`);
			} else {
				logger.error('Failed to get role by ID: Unknown error');
			}
			throw error;
		}
	}

	// Get all roles
	async getAllRoles(): Promise<Role[]> {
		try {
			const roles = await RoleModel.find().populate('permissions');
			logger.debug('All roles retrieved');
			return roles.map((role) => role.toObject() as Role);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get all roles: ${error.message}`);
			} else {
				logger.error('Failed to get all roles: Unknown error');
			}
			throw error;
		}
	}

	// Create a new permission
	async createPermission(permissionData: Permission): Promise<Permission> {
		try {
			const permission = new PermissionModel(permissionData);
			await permission.save();
			logger.debug(`Permission created: ${permission.name}`);
			return permission.toObject() as Permission;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to create permission: ${error.message}`);
			} else {
				logger.error('Failed to create permission: Unknown error');
			}
			throw error;
		}
	}

	// Update a permission
	async updatePermission(permission_id: string, permissionData: Partial<Permission>): Promise<void> {
		try {
			await PermissionModel.updateOne({ _id: permission_id }, { $set: permissionData });
			logger.debug(`Permission updated: ${permission_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to update permission: ${error.message}`);
			} else {
				logger.error('Failed to update permission: Unknown error');
			}
			throw error;
		}
	}

	// Delete a permission
	async deletePermission(permission_id: string): Promise<void> {
		try {
			await PermissionModel.deleteOne({ _id: permission_id });
			logger.debug(`Permission deleted: ${permission_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to delete permission: ${error.message}`);
			} else {
				logger.error('Failed to delete permission: Unknown error');
			}
			throw error;
		}
	}

	// Get a permission by ID
	async getPermissionById(permission_id: string): Promise<Permission | null> {
		try {
			const permission = await PermissionModel.findById(permission_id);
			logger.debug(`Permission retrieved by ID: ${permission_id}`);
			return permission ? (permission.toObject() as Permission) : null;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get permission by ID: ${error.message}`);
			} else {
				logger.error('Failed to get permission by ID: Unknown error');
			}
			throw error;
		}
	}

	// Get all permissions
	async getAllPermissions(): Promise<Permission[]> {
		try {
			const permissions = await PermissionModel.find();
			logger.debug('All permissions retrieved');
			return permissions.map((permission) => permission.toObject() as Permission);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get all permissions: ${error.message}`);
			} else {
				logger.error('Failed to get all permissions: Unknown error');
			}
			throw error;
		}
	}

	// Get permissions for a role
	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		try {
			const role = await RoleModel.findById(role_id).populate('permissions');
			logger.debug(`Permissions retrieved for role: ${role_id}`);
			return role ? (role.permissions as Permission[]) : [];
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get permissions for role: ${error.message}`);
			} else {
				logger.error('Failed to get permissions for role: Unknown error');
			}
			throw error;
		}
	}

	// Assign a permission to a role
	async assignPermissionToRole(role_id: string, permission_id: string): Promise<void> {
		try {
			await RoleModel.updateOne({ _id: role_id }, { $addToSet: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} assigned to role ${role_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to assign permission to role: ${error.message}`);
			} else {
				logger.error('Failed to assign permission to role: Unknown error');
			}
			throw error;
		}
	}

	// Remove a permission from a role
	async removePermissionFromRole(role_id: string, permission_id: string): Promise<void> {
		try {
			await RoleModel.updateOne({ _id: role_id }, { $pull: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} removed from role ${role_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to remove permission from role: ${error.message}`);
			} else {
				logger.error('Failed to remove permission from role: Unknown error');
			}
			throw error;
		}
	}

	// Assign a permission to a user
	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $addToSet: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} assigned to user ${user_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to assign permission to user: ${error.message}`);
			} else {
				logger.error('Failed to assign permission to user: Unknown error');
			}
			throw error;
		}
	}

	// Remove a permission from a user
	async removePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $pull: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} removed from user ${user_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to remove permission from user: ${error.message}`);
			} else {
				logger.error('Failed to remove permission from user: Unknown error');
			}
			throw error;
		}
	}

	// Get permissions for a user
	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		try {
			const user = await UserModel.findById(user_id).populate('permissions');
			logger.debug(`Permissions retrieved for user: ${user_id}`);
			return user ? (user.permissions as Permission[]) : [];
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to get permissions for user: ${error.message}`);
			} else {
				logger.error('Failed to get permissions for user: Unknown error');
			}
			throw error;
		}
	}
}
