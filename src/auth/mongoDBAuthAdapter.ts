import mongoose, { Schema, Document } from 'mongoose';
import type { FilterQuery, UpdateQuery } from 'mongoose';
import crypto from 'crypto';

// Import types
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token, Role, Permission } from './types';

// Define MongoDB schemas based on the shared field definitions

// Schema for User collection
const UserMongooseSchema = new Schema(
	{
		email: { type: String, required: true }, // User's email, required field
		password: String, // User's password, optional field
		role: { type: String, required: true }, // User's role, required field
		username: String, // User's username, optional field
		avatar: String, // URL of the user's avatar, optional field
		lastAuthMethod: String, // Last authentication method used by the user, optional field
		lastActiveAt: Date, // Last time the user was active, optional field
		expiresAt: Date, // Expiry date for the user, optional field
		is_registered: Boolean, // Registration status of the user, optional field
		blocked: Boolean, // Whether the user is blocked, optional field
		resetRequestedAt: String, // Last time the user requested a password reset, optional field
		resetToken: String // Token for resetting the user's password, optional field
	},
	{ timestamps: true }
); // Automatically adds createdAt and updatedAt fields

// Schema for Session collection
const SessionMongooseSchema = new Schema(
	{
		userId: { type: String, required: true }, // ID of the user who owns the session, required field
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
); // Automatically adds createdAt and updatedAt fields

// Schema for Token collection
const TokenMongooseSchema = new Schema(
	{
		userId: { type: String, required: true }, // ID of the user who owns the token, required field
		token: { type: String, required: true }, // Token string, required field
		email: { type: String, required: true }, // Email associated with the token, required field
		expires: { type: Date, required: true } // Expiry date of the token, required field
	},
	{ timestamps: true }
); // Automatically adds createdAt and updatedAt fields

const RoleSchema = new Schema(
	{
		name: { type: String, required: true },
		description: { type: String, required: false }
	},
	{ timestamps: true }
); // Added comma here

const PermissionSchema = new Schema(
	{
		name: { type: String, required: true },
		description: { type: String, required: false }
	},
	{ timestamps: true }
); // Added comma here

// Check and create models only if they don't exist
const UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserMongooseSchema);
const SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionMongooseSchema);
const TokenModel = mongoose.models.auth_tokens || mongoose.model<Token & Document>('auth_tokens', TokenMongooseSchema);
const RoleModel = mongoose.models.auth_roles || mongoose.model<Role & Document>('auth_roles', RoleSchema);
const PermissionModel = mongoose.models.auth_permissions || mongoose.model<Permission & Document>('auth_permissions', PermissionSchema);

// Export Mongoose schemas and models for external use
export { UserMongooseSchema, SessionMongooseSchema, TokenMongooseSchema, UserModel, SessionModel, TokenModel };

// MongoDBAuthAdapter class implementing AuthDBAdapter interface
export class MongoDBAuthAdapter implements AuthDBAdapter {
	// Create a new user.
	async createUser(userData: Partial<User>): Promise<User> {
		// Ensure email is not null or undefined, set a default if necessary or throw an error.
		if (!userData.email) {
			throw new Error('Email is required');
		}
		// Add more validations as needed for other fields
		const user = await UserModel.create(userData);
		return user.toObject() as User;
	}

	// Update attributes of an existing user.
	async updateUserAttributes(userId: string, attributes: Partial<User>): Promise<void> {
		// Prepare the filter and update statements with proper typings
		const filter: FilterQuery<User> = { _id: userId };
		const update: UpdateQuery<User> = { $set: attributes };

		// Execute the update with correctly typed parameters
		await UserModel.updateOne(filter, update);
	}

	// Delete a user by ID.
	async deleteUser(id: string): Promise<void> {
		await UserModel.deleteOne({ _id: id });
	}

	// Get a user by ID.
	async getUserById(id: string): Promise<User | null> {
		const user = await UserModel.findById(id);
		return user ? (user.toObject() as User) : null;
	}

	// Get a user by email.
	async getUserByEmail(email: string): Promise<User | null> {
		const user = await UserModel.findOne({ email });
		return user ? (user.toObject() as User) : null;
	}

	// Get all users.
	async getAllUsers(): Promise<User[]> {
		const users = await UserModel.find();
		return users.map((user) => user.toObject() as User);
	}

	// Get the total number of users.
	async getUserCount(): Promise<number> {
		return await UserModel.countDocuments();
	}

	// Create a new session for a user.
	async createSession(data: { userId: string; expires: number }): Promise<Session> {
		console.log('Attempting to create session for user:', data.userId);
		const session = await SessionModel.create({
			userId: data.userId, // Use userId directly, Mongoose will generate ObjectId
			expires: new Date(Date.now() + data.expires)
		});
		if (!session) {
			console.error('Failed to create session');
			throw new Error('Session creation failed');
		}
		console.log('Session created:', session);
		return session.toObject() as Session;
	}

	// Destroy a session by ID.
	async destroySession(sessionId: string): Promise<void> {
		await SessionModel.deleteOne({ _id: sessionId });
	}

	// Validate a session by ID.

	async validateSession(sessionId: string): Promise<User | null> {
		console.log(`Validating session with ID: ${sessionId}`);
		const session = await SessionModel.findById(sessionId);
		if (!session) {
			console.log('No session found with ID:', sessionId);
			return null;
		}
		console.log('Session found:', session);
		if (session.expires > new Date()) {
			const user = await UserModel.findById(session.userId); // Use session.userId directly
			if (!user) {
				console.log('No user found for session ID:', sessionId);
				return null;
			}
			console.log('Session is valid, user found:', user);
			return user.toObject() as User;
		} else {
			console.log('Session expired:', session);
			return null;
		}
	}

	// Invalidate all sessions for a user.
	async invalidateAllUserSessions(userId: string): Promise<void> {
		await SessionModel.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
	}

	// Create a new token for a user.
	async createToken(data: { userId: string; email: string; expires: number }): Promise<string> {
		const { userId, email, expires } = data; // Destructure the data object to extract properties
		const tokenString = crypto.randomBytes(16).toString('hex'); // Generate a secure token string
		await TokenModel.create({
			userId: new mongoose.Types.ObjectId(userId), // Convert userId to ObjectId for MongoDB
			token: tokenString,
			email,
			expires: new Date(Date.now() + expires) // Calculate the expiration time from the current time
		});
		return tokenString; // Return the newly created token string
	}

	// Validate a token
	async validateToken(token: string, userId: string): Promise<{ success: boolean; message: string }> {
		console.log(`Validating token: ${token} for user ID: ${userId}`);
		const tokenDoc = await TokenModel.findOne({ token, userId: new mongoose.Types.ObjectId(userId) });
		if (tokenDoc) {
			if (tokenDoc.expires > new Date()) {
				return { success: true, message: 'Token is valid' };
			} else {
				return { success: false, message: 'Token is expired' };
			}
		} else {
			return { success: false, message: 'Token does not exist' };
		}
	}

	// Consume a token
	async consumeToken(token: string, userId: string): Promise<{ status: boolean; message: string }> {
		console.log(`Consuming token: ${token} for user ID: ${userId}`);
		const tokenDoc = await TokenModel.findOneAndDelete({ token, userId: new mongoose.Types.ObjectId(userId) });
		if (tokenDoc) {
			if (tokenDoc.expires > new Date()) {
				return { status: true, message: 'Token is valid' };
			} else {
				return { status: false, message: 'Token is expired' };
			}
		} else {
			return { status: false, message: 'Token does not exist' };
		}
	}

	// Get all tokens
	async getAllTokens(): Promise<Token[]> {
		const tokens = await TokenModel.find();
		return tokens.map((token) => token.toObject() as Token);
	}

	// Complete Role management
	async createRole(roleData: Role): Promise<Role> {
		const role = new RoleModel(roleData);
		await role.save();
		return role.toObject() as Role;
	}

	async updateRole(roleId: string, roleData: Partial<Role>): Promise<void> {
		const filter: FilterQuery<Role> = { _id: roleId };
		const update: UpdateQuery<Role> = { $set: roleData };

		await RoleModel.updateOne(filter, update);
	}

	async deleteRole(roleId: string): Promise<void> {
		await RoleModel.deleteOne({ _id: roleId });
	}

	async getRoleById(roleId: string): Promise<Role | null> {
		const role = await RoleModel.findById(roleId);
		return role ? (role.toObject() as Role) : null;
	}

	async getAllRoles(): Promise<Role[]> {
		const roles = await RoleModel.find();
		return roles.map((role) => role.toObject() as Role);
	}

	// Complete Permissions management
	async createPermission(permissionData: Permission): Promise<Permission> {
		const permission = new PermissionModel(permissionData);
		await permission.save();
		return permission.toObject() as Permission;
	}

	async updatePermission(permissionId: string, permissionData: Partial<Permission>): Promise<void> {
		await PermissionModel.updateOne({ _id: permissionId }, { $set: permissionData });
	}

	async deletePermission(permissionId: string): Promise<void> {
		await PermissionModel.deleteOne({ _id: permissionId });
	}

	async getPermissionById(permissionId: string): Promise<Permission | null> {
		const permission = await PermissionModel.findById(permissionId);
		return permission ? (permission.toObject() as Permission) : null;
	}

	async getAllPermissions(): Promise<Permission[]> {
		const permissions = await PermissionModel.find();
		return permissions.map((permission) => permission.toObject() as Permission);
	}

	async getPermissionsForRole(roleId: string): Promise<Permission[]> {
		const role = await RoleModel.findById(roleId).populate('permissions');
		return role ? (role.permissions as Permission[]) : [];
	}

	// Add the missing link and unlink permissions to roles
	async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
		await RoleModel.updateOne({ _id: roleId }, { $addToSet: { permissions: permissionId } });
	}

	async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
		await RoleModel.updateOne({ _id: roleId }, { $pull: { permissions: permissionId } });
	}
}
