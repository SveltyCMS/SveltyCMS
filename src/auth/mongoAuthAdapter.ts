import mongoose, { Schema, Document } from 'mongoose';
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token } from './types';
import crypto from 'crypto';

// Import schemas from types.ts
import { UserSchema, SessionSchema, TokenSchema } from './types';

// Create Mongoose schemas
const UserMongooseSchema = new Schema(UserSchema, { timestamps: true });
const SessionMongooseSchema = new Schema(SessionSchema, { id: true });
const TokenMongooseSchema = new Schema(TokenSchema, { timestamps: true, id: true });

// Create Mongoose models
const UserModel = mongoose.model<User & Document>('User', UserMongooseSchema);
const SessionModel = mongoose.model<Session & Document>('Session', SessionMongooseSchema);
const TokenModel = mongoose.model<Token & Document>('Token', TokenMongooseSchema);

export class MongoAuthAdapter implements AuthDBAdapter {
	async createUser(userData: Partial<User>): Promise<User> {
		const user = await UserModel.create(userData);
		return user.toObject() as User;
	}

	async updateUserAttributes(user: User, attributes: Partial<User>): Promise<void> {
		await UserModel.updateOne({ _id: user.id }, { $set: attributes });
	}

	async deleteUser(id: string): Promise<void> {
		await UserModel.deleteOne({ _id: id });
	}

	async getUserById(id: string): Promise<User | null> {
		const user = await UserModel.findById(id);
		return user ? (user.toObject() as User) : null;
	}

	async getUserByEmail(email: string): Promise<User | null> {
		const user = await UserModel.findOne({ email });
		return user ? (user.toObject() as User) : null;
	}

	async getAllUsers(): Promise<User[]> {
		const users = await UserModel.find();
		return users.map((user) => user.toObject() as User);
	}

	async getUserCount(): Promise<number> {
		return await UserModel.countDocuments();
	}

	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		const session = await SessionModel.create({
			user_id: new mongoose.Types.ObjectId(data.user_id),
			expires: new Date(Date.now() + data.expires)
		});
		return session.toObject() as Session;
	}

	async destroySession(session_id: string): Promise<void> {
		await SessionModel.deleteOne({ _id: session_id });
	}

	async validateSession(session_id: string): Promise<User | null> {
		const session = await SessionModel.findById(session_id).populate('user_id');
		if (session && session.expires > new Date()) {
			return (session.user_id as any).toObject() as User;
		}
		return null;
	}

	async invalidateAllUserSessions(user_id: string): Promise<void> {
		await SessionModel.deleteMany({ user_id: new mongoose.Types.ObjectId(user_id) });
	}

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

	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
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

	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
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

	async getAllTokens(): Promise<Token[]> {
		const tokens = await TokenModel.find();
		return tokens.map((token) => token.toObject() as Token);
	}
}

export { UserSchema, SessionSchema, TokenSchema };
