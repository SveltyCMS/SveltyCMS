import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

// Import logger
import logger from '@utils/logger';

// Import types
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token, Role, Permission } from './types';

// Utility function to convert MongoDB _id to id
const convertId = (doc: any) => {
	if (doc._id) {
		doc.id = doc._id.toString();
		delete doc._id;
	}
	return doc;
};

// Schema for User collection
const UserSchema = new Schema(
	{
		id: { type: String, required: false },
		email: { type: String, required: true }, // User's email, required field
		password: String, // User's password, optional field
		role: { type: String, required: true }, // User's role, required field
		username: String, // User's username, optional field
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
		userId: { type: String, required: true }, // ID of the user who owns the session, required field
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
);

// Schema for Token collection
const TokenSchema = new Schema(
	{
		userId: { type: String, required: true }, // ID of the user who owns the token, required field
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

// MongoDBAuthAdapter class implementing AuthDBAdapter interface
export class MongoDBAuthAdapter implements AuthDBAdapter {
	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const user = new UserModel(userData);
			await user.save();
			logger.info(`User created: ${user.email}`);
			return convertId(user.toObject()) as User;
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
	async updateUserAttributes(userId: string, attributes: Partial<User>): Promise<void> {
		try {
			await UserModel.updateOne({ _id: userId }, { $set: attributes });
			logger.info(`User attributes updated: ${userId}`);
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
	async deleteUser(userId: string): Promise<void> {
		try {
			await UserModel.deleteOne({ _id: userId });
			logger.info(`User deleted: ${userId}`);
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
	async getUserById(userId: string): Promise<User | null> {
		try {
			const user = await UserModel.findById(userId);
			logger.info(`User retrieved by ID: ${userId}`);
			return user ? (convertId(user.toObject()) as User) : null;
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
			logger.info(`User retrieved by email: ${email}`);
			return user ? (convertId(user.toObject()) as User) : null;
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
			logger.info('All users retrieved');
			return users.map((user) => convertId(user.toObject()) as User);
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
			logger.info(`User count retrieved: ${count}`);
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
	async createSession(data: { userId: string; expires: number }): Promise<Session> {
		try {
			const expiresAt = new Date(Date.now() + data.expires);
			const session = new SessionModel({
				userId: data.userId,
				expires: expiresAt
			});
			await session.save();
			logger.info(`Session created for user: ${data.userId}, expires at: ${expiresAt}`);
			return convertId(session.toObject()) as Session;
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
	async destroySession(sessionId: string): Promise<void> {
		try {
			await SessionModel.deleteOne({ _id: sessionId });
			logger.info(`Session destroyed: ${sessionId}`);
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
	async validateSession(sessionId: string): Promise<User | null> {
		try {
			const session = await SessionModel.findById(sessionId);
			if (!session || session.expires <= new Date()) {
				if (session) await SessionModel.deleteOne({ _id: sessionId });
				logger.warn(`Session invalid or expired: ${sessionId}`);
				return null;
			}
			const user = await UserModel.findById(session.userId);
			logger.info(`Session validated for user: ${session.userId}`);
			return user ? (convertId(user.toObject()) as User) : null;
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
	async invalidateAllUserSessions(userId: string): Promise<void> {
		try {
			await SessionModel.deleteMany({ userId });
			logger.info(`All sessions invalidated for user: ${userId}`);
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
	async createToken(data: { userId: string; email: string; expires: number }): Promise<string> {
		try {
			const tokenString = crypto.randomBytes(16).toString('hex'); // Generate a secure token string
			const token = new TokenModel({
				userId: data.userId,
				token: tokenString,
				email: data.email,
				expires: new Date(Date.now() + data.expires) // Calculate the expiration time from the current time
			});
			await token.save();
			logger.info(`Token created for user: ${data.userId}`);
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
	async validateToken(token: string, userId: string): Promise<{ success: boolean; message: string }> {
		try {
			const tokenDoc = await TokenModel.findOne({ token, userId });
			if (tokenDoc) {
				const message = tokenDoc.expires > new Date() ? 'Token is valid' : 'Token is expired';
				logger.info(`Token validation result for user: ${userId}, message: ${message}`);
				return { success: tokenDoc.expires > new Date(), message };
			} else {
				const message = 'Token does not exist';
				logger.warn(`Token validation result for user: ${userId}, message: ${message}`);
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
	async consumeToken(token: string, userId: string): Promise<{ status: boolean; message: string }> {
		try {
			const tokenDoc = await TokenModel.findOneAndDelete({ token, userId });
			if (tokenDoc) {
				const message = tokenDoc.expires > new Date() ? 'Token is valid' : 'Token is expired';
				logger.info(`Token consumed for user: ${userId}, message: ${message}`);
				return { status: tokenDoc.expires > new Date(), message };
			} else {
				const message = 'Token does not exist';
				logger.warn(`Token consumption result for user: ${userId}, message: ${message}`);
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
			logger.info('All tokens retrieved');
			return tokens.map((token) => convertId(token.toObject()) as Token);
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
			logger.info(`Role created: ${role.name}`);
			return convertId(role.toObject()) as Role;
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
	async updateRole(roleId: string, roleData: Partial<Role>): Promise<void> {
		try {
			await RoleModel.updateOne({ _id: roleId }, { $set: roleData });
			logger.info(`Role updated: ${roleId}`);
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
	async deleteRole(roleId: string): Promise<void> {
		try {
			await RoleModel.deleteOne({ _id: roleId });
			logger.info(`Role deleted: ${roleId}`);
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
	async getRoleById(roleId: string): Promise<Role | null> {
		try {
			const role = await RoleModel.findById(roleId).populate('permissions');
			logger.info(`Role retrieved by ID: ${roleId}`);
			return role ? (convertId(role.toObject()) as Role) : null;
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
			logger.info('All roles retrieved');
			return roles.map((role) => convertId(role.toObject()) as Role);
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
			logger.info(`Permission created: ${permission.name}`);
			return convertId(permission.toObject()) as Permission;
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
	async updatePermission(permissionId: string, permissionData: Partial<Permission>): Promise<void> {
		try {
			await PermissionModel.updateOne({ _id: permissionId }, { $set: permissionData });
			logger.info(`Permission updated: ${permissionId}`);
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
	async deletePermission(permissionId: string): Promise<void> {
		try {
			await PermissionModel.deleteOne({ _id: permissionId });
			logger.info(`Permission deleted: ${permissionId}`);
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
	async getPermissionById(permissionId: string): Promise<Permission | null> {
		try {
			const permission = await PermissionModel.findById(permissionId);
			logger.info(`Permission retrieved by ID: ${permissionId}`);
			return permission ? (convertId(permission.toObject()) as Permission) : null;
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
			logger.info('All permissions retrieved');
			return permissions.map((permission) => convertId(permission.toObject()) as Permission);
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
	async getPermissionsForRole(roleId: string): Promise<Permission[]> {
		try {
			const role = await RoleModel.findById(roleId).populate('permissions');
			logger.info(`Permissions retrieved for role: ${roleId}`);
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
	async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
		try {
			await RoleModel.updateOne({ _id: roleId }, { $addToSet: { permissions: permissionId } });
			logger.info(`Permission ${permissionId} assigned to role ${roleId}`);
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
	async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
		try {
			await RoleModel.updateOne({ _id: roleId }, { $pull: { permissions: permissionId } });
			logger.info(`Permission ${permissionId} removed from role ${roleId}`);
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
	async assignPermissionToUser(userId: string, permissionId: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: userId }, { $addToSet: { permissions: permissionId } });
			logger.info(`Permission ${permissionId} assigned to user ${userId}`);
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
	async removePermissionFromUser(userId: string, permissionId: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: userId }, { $pull: { permissions: permissionId } });
			logger.info(`Permission ${permissionId} removed from user ${userId}`);
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
	async getPermissionsForUser(userId: string): Promise<Permission[]> {
		try {
			const user = await UserModel.findById(userId).populate('permissions');
			logger.info(`Permissions retrieved for user: ${userId}`);
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
