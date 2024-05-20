import argon2 from 'argon2';
import { consumeToken, createNewToken, validateToken } from './tokens';
import type { Cookie, User, Session, Model } from './types';
import mongoose from 'mongoose';
export const SESSION_COOKIE_NAME = 'auth_sessions';

// argon2 attributes
const argon2Attributes = {
	type: argon2.argon2id, // Using Argon2id variant for a balance between Argon2i and Argon2d
	timeCost: 2, // Number of iterations
	memoryCost: 2 ** 12, //using memory cost of 2^12 = 4MB
	parallelism: 2, // Number of execution threads
	saltLength: 16 // Salt length in bytes
} as { secret?: any };

export class Auth {
	private User: Model;
	private Token: Model;
	private Session: Model;

	constructor({ User, Token, Session }) {
		// Initialize the User, Token, and Session models
		this.User = User;
		this.Token = Token;
		this.Session = Session;
	}

	async createUser(userData: Partial<User>) {
		const { email, password, username, role, lastAuthMethod, is_registered } = userData;

		// Hash the password
		let hashed_password: string | undefined = undefined;
		if (password) {
			hashed_password = await argon2.hash(password, argon2Attributes);
		}

		// Create the User (no need to include createdAt/updatedAt)
		const user = await this.User.create({
			email,
			password: hashed_password,
			username,
			role,
			lastAuthMethod,
			is_registered
		});

		// returning the full user object
		return user;
	}

	async updateUserAttributes(user: User, attributes: Partial<User>) {
		// Check if password needs updating
		if (attributes.password) {
			// Hash the password with argon2
			attributes.password = await argon2.hash(attributes.password, argon2Attributes);
		}
		// Update the user attributes
		return await this.User.updateOne({ _id: user.id }, { $set: attributes });
	}

	// Delete the user from the database
	async deleteUser(id: string) {
		await this.User.deleteOne({ _id: id });
	}

	// Session Valid for 1 Hr, and only one session per device
	async createSession({ user_id, expires = 60 * 60 * 1000 }: { user_id: mongoose.Types.ObjectId; expires?: number }) {
		// Create the User session
		const sessionData = {
			user_id: user_id, // Pass the ObjectId
			expires: Date.now() + expires // Calculate expiration timestamp as a Date object
		};

		await this.Session.insertMany(sessionData);

		// Find the session we just created
		const session = await this.Session.findOne(sessionData);

		// Return the User Session object
		return session;
	}

	async checkUser(fields: { _id?: string; email?: string }): Promise<User | null>;

	async checkUser(fields: { _id: string; email: string }): Promise<User | null> {
		// Find the user document
		const user = await this.User.findOne(fields);

		// Return the user object or null if not found
		return user;
	}

	// Get User Count
	async getUserCount(): Promise<number> {
		return await this.User.countDocuments(); // Return all users from the User collection
	}

	// Get User by ID
	async getUserById(id: string): Promise<User | null> {
		const user = await this.User.findOne({ _id: id }); // Find the user document
		return user; // Return the user object or null if not found
	}

	// Get All Users
	async getAllUsers(): Promise<User[]> {
		const users = await this.User.find({}); // Return all users from the User collection
		return users; // Return the user object or null if not found
	}
	// Get All Tokens
	async getAllTokens(): Promise<any[]> {
		const token = await this.Token.find({}); // Return all tokens from the Token collection
		return token; // Return the token object or null if not found
	}

	// Delete the User Session
	async destroySession(session_id: string) {
		await this.Session.deleteOne({ _id: session_id });
	}

	// Create a cookie object tht expires in 1 year
	createSessionCookie(session: Session): Cookie {
		const cookie: Cookie = {
			name: SESSION_COOKIE_NAME,
			value: session.id,
			attributes: {
				sameSite: 'lax',
				path: '/',
				httpOnly: true,
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // expires in 1 year
				secure: false
			}
		};

		// Return the cookie object
		return cookie;
	}

	// Login
	async login(email: string, password: string): Promise<User | null> {
		// Find the user document
		const user = await this.User.findOne({ email });

		// Check if user exists
		if (!user) {
			return null; // User not found
		}

		// Verify password
		const passwordMatch = await argon2.verify(user.password, password);
		if (passwordMatch) {
			user && delete user._id;
			return user; // Password matches, return user object
		} else {
			return null; // Password does not match
		}
	}

	// Log Out
	async logOut(session_id: string) {
		await this.Session.deleteOne({ _id: session_id }); // Delete this session
	}

	async validateSession(session_id: mongoose.Types.ObjectId): Promise<User | null> {
		//console.log('validateSession called', session_id);

		const resp = (
			await this.Session.aggregate([
				{
					$match: {
						_id: new mongoose.Types.ObjectId(session_id) // Use the ObjectId constructor
					}
				},
				{ $addFields: { user_id: { $toObjectId: '$user_id' } } },
				{
					// Match user_id to user._id
					$lookup: {
						from: this.User.collection.name,
						localField: 'user_id',
						foreignField: '_id',
						as: 'user'
					}
				},
				{
					$unwind: '$user' // Unwind the 'user' field
				}
			])
		)?.[0];

		// Check if the user record exists
		if (!resp || !resp.user) {
			console.error('User is not signed in for session:', session_id);
			return null;
		}

		// Return the user object
		resp.user.id = resp.user._id.toString();
		delete resp.user._id;
		// Return the user object
		return resp.user;
	}

	// Create a token, default expires in 1 hr
	async createToken(user_id: mongoose.Types.ObjectId, expires = 60 * 60 * 1000) {
		// Look up the user record
		const user = await this.User.findById(user_id);

		if (!user) {
			throw new Error('User not found');
		}

		// Get the email from the user record
		const email = user.email; // // Return the created token

		// return createToken;
		return await createNewToken(this.Token, user._id, email, expires);
	}

	// Validate the token
	async validateToken(token: string, user_id: mongoose.Types.ObjectId) {
		return await validateToken(this.Token, token, user_id);
	}

	// Consume the token
	async consumeToken(token: string, user_id: mongoose.Types.ObjectId) {
		// Consume the token
		return await consumeToken(this.Token, token, user_id);
	}

	async invalidateAllUserSessions(user_id: string) {
		// Get all sessions for the given user ID
		const sessions = await this.Session.find({ user_id });

		// Delete all the sessions
		await Promise.all(sessions.map((session) => this.Session.deleteOne({ _id: session._id })));
	}

	async updateUserPassword(email: string, newPassword: string) {
		// Get the user document based on the email
		const user = await this.User.findOne({ email });

		// If no User was found, return an error
		if (!user) {
			return { status: false, message: 'User not found' };
		}

		// Update the password for the user
		user.password = await argon2.hash(newPassword, argon2Attributes);

		// Save the updated user
		await user.save();

		// Return a success message
		return { status: true, message: 'Password updated successfully' };
	}
}
