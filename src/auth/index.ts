import argon2 from 'argon2';
import { consumeToken, createToken, validateToken } from './tokens';
import type { Cookie, User, Session, Model, UserParams } from './types';
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

		// Generate a unique ID for the user from mongoose as string
		const id = new mongoose.Types.ObjectId();

		// Hash the password
		let hashed_password: string | undefined = undefined;
		if (password) {
			hashed_password = await argon2.hash(password, argon2Attributes);
		}

		// Create the User
		const user = (
			await this.User.insertMany({
				_id: id, // Use the generated ID from mongoose as string
				email,
				password: hashed_password,
				username,
				role,
				lastAuthMethod,
				is_registered
			})
		)?.[0];

		user._id && delete user._id;

		// Return the user object
		return user as User;
	}

	async updateUserAttributes(user: User, attributes: Partial<User>) {
		// Check if password needs updating
		if (attributes.password) {
			// Hash the password with argon2
			attributes.password = await argon2.hash(attributes.password, argon2Attributes);
		}
		// Update the user attributes
		await this.User.updateOne({ _id: user._id }, { $set: attributes });
	}

	// Delete the user from the database
	async deleteUser(id: string) {
		await this.User.deleteOne({ _id: id });
	}

	// Session Valid for 1 Hr, and only one session per device
	async createSession({ user_id, expires = 60 * 60 * 1000 }: { user_id: string; expires?: number }) {
		console.log('createSession called', user_id, expires);

		// Generate a unique ID for the user from mongoose as string
		const id = new mongoose.Types.ObjectId();

		// Check if user_id is provided
		if (!user_id) {
			throw new Error('User ID is required to create a session.');
		}

		// Create the User session
		// const session = await this.Session.create({
		// 	//_id: id, // Use the generated ID from mongoose as string
		// 	user_id, // Pass the user_id directly
		// 	expires: Date.now() + expires //Calculate expiration timestamp
		// });

		const session = (
			await this.Session.insertMany({
				_id: id,
				user_id,
				expires: Date.now() + expires
			})
		)?.[0];

		// Return the session object
		return session as Session;
	}

	async checkUser(fields: { _id?: string; email?: string }): Promise<User | null>;

	async checkUser(fields: { _id: string; email: string }): Promise<User | null> {
		// Find the user document
		const user = await this.User.findOne(fields);

		// Return the user object or null if not found
		return user;
	}

	// Get User by ID
	async getUserCount(): Promise<number> {
		return await this.User.countDocuments();
	}

	// Get All Users
	async getAllUsers(): Promise<User[]> {
		const users = await this.User.find({});
		return users;
	}
	// Get All Tokens
	async getAllTokens(): Promise<any[]> {
		const token = await this.Token.find({}); // Return all tokens from the Token collection
		return token;
	}

	// Delete the User Session
	async destroySession(session_id: string) {
		await this.Session.deleteOne({ _id: session_id });
	}

	createSessionCookie(session: Session): Cookie {
		// Create a cookie object tht expires in 1 year
		const cookie: Cookie = {
			name: SESSION_COOKIE_NAME,
			value: session._id as string,
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
		try {
			// Find the user document
			const user = await this.User.findOne({ email });

			// Check if user exists
			if (!user) {
				return null; // User not found
			}

			// Verify password
			const passwordMatch = await argon2.verify(user.password, password);
			if (passwordMatch) {
				return user; // Password matches, return user object
			} else {
				return null; // Password does not match
			}
		} catch (error) {
			console.error('Error during login:', error);
			return null; // Return null in case of any error
		}
	}

	// Log Out
	async logOut(session_id: string) {
		await this.Session.deleteOne({ _id: session_id }); // Delete this session
	}

	async validateSession(session_id: string): Promise<User | null> {
		//console.log('validateSession called', session_id);

		const resp = (
			await this.Session.aggregate([
				{
					$match: {
						// _id: session_id // Use the session_id string directly
						_id: new mongoose.Types.ObjectId(session_id)
					}
				},
				{ $addFields: { userID: { $toObjectId: '$user_id' } } },
				{
					$lookup: {
						from: this.User.collection.name,
						localField: 'user_id',
						foreignField: '_id',
						as: 'user'
					}
				},
				{
					$unwind: '$user'
				}
			])
		)?.[0];

		// Check if the user record exists
		if (!resp || !resp.user) {
			console.error('User is not Signed in for session :', session_id);
			return null;
		}
		// If no Result, return null
		if (!resp) return null;
		resp.user._id && delete resp.user._id;
		// Return the user object
		return resp.user;
	}

	// Create a token, default expires in 1 hr
	async createToken(user_id: string, expires = 60 * 60 * 1000) {
		// Generate a unique ID for the user from mongoose as string
		const _id = new mongoose.Types.ObjectId().toString();

		// Look up the user record
		const user = await this.User.findById(user_id);

		if (!user) {
			throw new Error('User not found');
		}

		// Get the email from the user record
		const email = user.email;

		// Create the token
		// const createToken = await this.Token.create({
		// 	_id: id, // Use the generated ID from mongoose as string
		// 	user_id: user_id, // Pass the user_id directly
		// 	email: email,
		// 	expires: Date.now() + expires //Calculate expiration timestamp
		// });

		// // Return the created token

		// return createToken;
		return await createToken(_id, this.Token, user._id.toString(), email, expires);
	}

	// Validate the token
	async validateToken(token: string, user_id: string) {
		return await validateToken(this.Token, token, user_id.toString());
	}

	// Consume the token
	async consumeToken(token: string, user_id: string) {
		// Consume the token
		return await consumeToken(this.Token, token, user_id.toString());
	}

	async invalidateAllUserSessions(user_id: string) {
		// Get all sessions for the given user ID
		const sessions = await this.Session.find({ user_id });

		// Delete all the sessions
		await Promise.all(sessions.map((session) => this.Session.deleteOne({ _id: session._id })));
	}

	async updateKeyPassword(providerId: string, providerUserId: string, newPassword: string) {
		// Get the key document for the given provider ID and provider user ID
		const user = await this.User.findOne({ providerId, providerUserId });

		// If no key was found, return an error
		if (!user) {
			return { status: false, message: 'Key not found' };
		}

		// Update the password for the key
		user.password = newPassword;

		// Save the updated key document
		await user.save();

		// Return a success message
		return { status: true, message: 'Password updated successfully' };
	}
}
