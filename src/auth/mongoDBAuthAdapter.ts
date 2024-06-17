import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

// Import types
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token } from './types';

// Define MongoDB schemas based on the types
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
		user_id: { type: String, required: true }, // ID of the user who owns the session, required field
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
); // Automatically adds createdAt and updatedAt fields

// Schema for Token collection
const TokenMongooseSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the token, required field
		token: { type: String, required: true }, // Token string, required field
		email: String, // Email associated with the token, optional field
		expires: { type: Date, required: true } // Expiry date of the token, required field
	},
	{ timestamps: true }
); // Automatically adds createdAt and updatedAt fields

// Check and create models only if they don't exist
const UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserMongooseSchema);
const SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionMongooseSchema);
const TokenModel = mongoose.models.auth_tokens || mongoose.model<Token & Document>('auth_tokens', TokenMongooseSchema);

// Export Mongoose schemas and models for external use
export { UserMongooseSchema, SessionMongooseSchema, TokenMongooseSchema, UserModel, SessionModel, TokenModel };

// MongoDBAuthAdapter class implementing AuthDBAdapter interface
export class MongoDBAuthAdapter implements AuthDBAdapter {
	// Create a new user.
	async createUser(userData: Partial<User>): Promise<User> {
		const user = await UserModel.create(userData);
		return user.toObject() as User;
	}

	// Update attributes of an existing user.
	async updateUserAttributes(user: User, attributes: Partial<User>): Promise<void> {
		await UserModel.updateOne({ _id: user.id }, { $set: attributes });
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
	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		const session = await SessionModel.create({
			user_id: new mongoose.Types.ObjectId(data.user_id),
			expires: new Date(Date.now() + data.expires)
		});
		return session.toObject() as Session;
	}

	// Destroy a session by ID.
	async destroySession(session_id: string): Promise<void> {
		await SessionModel.deleteOne({ _id: session_id });
	}

	// Validate a session by ID.
	async validateSession(session_id: string): Promise<User | null> {
		console.log(`Validating session with ID: ${session_id}`);
		const session = await SessionModel.findById(session_id);
		if (session) {
			console.log(`Session found: ${session}`);
			if (session.expires > new Date()) {
				const user = await UserModel.findById(session.user_id);
				console.log(`User found: ${user}`);
				return user ? (user.toObject() as User) : null;
			} else {
				console.log(`Session expired: ${session}`);
			}
		} else {
			console.log(`Session not found with ID: ${session_id}`);
		}
		return null;
	}

	// Invalidate all sessions for a user.
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		await SessionModel.deleteMany({ user_id: new mongoose.Types.ObjectId(user_id) });
	}

	// Create a new token for a user.
	async createToken(user_id: string, email: string, expires: number): Promise<string> {
		const tokenString = crypto.randomBytes(16).toString('hex');
		await TokenModel.create({
			user_id: new mongoose.Types.ObjectId(user_id),
			token: tokenString,
			email,
			expires: new Date(Date.now() + expires)
		});
		return tokenString;
	}

	// Validate a token
	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		console.log(`Validating token: ${token} for user ID: ${user_id}`);
		const tokenDoc = await TokenModel.findOne({ token, user_id: new mongoose.Types.ObjectId(user_id) });
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
	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		console.log(`Consuming token: ${token} for user ID: ${user_id}`);
		const tokenDoc = await TokenModel.findOneAndDelete({ token, user_id: new mongoose.Types.ObjectId(user_id) });
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
}
