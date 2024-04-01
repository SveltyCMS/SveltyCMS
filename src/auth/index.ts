import argon2 from 'argon2';
import mongoose from 'mongoose';
import { consumeToken, createToken, validateToken } from './tokens';
import type { Cookie, User, UserParams, Session, Model } from './types';

export const SESSION_COOKIE_NAME = 'auth_sessions';

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

	async createUser({ email, password, username, role, lastAuthMethod, is_registered }: Omit<User, UserParams>) {
		try {
			// Generate a unique ID for the user
			const userId = new mongoose.Types.ObjectId();

			// Hash the password
			let hashed_password: string | undefined = undefined;
			// Hash the password with argon2
			if (password) hashed_password = await argon2.hash(password);

			// Create the user document
			const user = (
				await this.User.insertMany({
					_id: userId,
					email,
					password: hashed_password,
					username,
					role,
					lastAuthMethod,
					is_registered
				})
			)?.[0];

			// Return the user object
			return user as User;
		} catch (err) {
			console.error(err);
			throw new Error('Error creating User');
		}
	}

	async updateUserAttributes(user: User, attributes: Partial<User>) {
		// Check if password needs updating
		if (attributes.password) {
			// Hash the password with argon2
			attributes.password = await argon2.hash(attributes.password);
		}

		// Update the user document (excluding password if unchanged)
		const updateObject = { ...attributes };
		delete updateObject.password; // Remove password from update if not modified

		await this.User.updateOne({ id: user.id }, { $set: updateObject });
	}

	async deleteUser(id: string) {
		// Delete the user document
		await this.User.deleteOne({ id });
	}

	// Session Valid for 1 Hr
	async createSession({ user_id, expires = 60 * 60 * 1000 }: { user_id: string; expires?: number }) {
		try {
			// Calculate expiration timestamp
			const expiration = Date.now() + expires;

			// Create an ObjectId for _id
			const sessionObjectId = new mongoose.Types.ObjectId();

			// Create the session with both _id and id fields
			const session = await this.Session.create({
				_id: sessionObjectId,
				id: sessionObjectId.toString(), // Set id field as a string
				user_id,
				expires: expiration
			});

			return session;
		} catch (error) {
			console.error(error);
			throw new Error('Error creating session');
		}
	}

	async checkUser(fields: { email: string; id: string }): Promise<User | null> {
		// Find the user document
		const user = await this.User.findOne(fields);

		// Return the user object or null if not found
		return user;
	}

	async getUserCount(): Promise<number> {
		// Get the number of user documents
		return await this.User.countDocuments();
	}

	async getAllUsers(): Promise<User[]> {
		// Find all user documents
		return await this.User.find({});
	}

	async destroySession(session_id: string) {
		// Delete the session document
		await this.Session.deleteOne({ id: session_id });
	}

	createSessionCookie(session: Session): Cookie {
		// Create a cookie object tht expires in 1 year
		const cookie: Cookie = {
			name: SESSION_COOKIE_NAME,
			value: session.id,
			attributes: {
				sameSite: 'lax',
				path: '/',
				httpOnly: true,
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
				secure: true
			}
		};

		// Return the cookie object
		return cookie;
	}

	async login(email: string, password: string): Promise<User | null> {
		// Find the user document
		const user = await this.User.findOne({ email });

		// Check if user exists
		if (user) {
			// Verify password using argon2
			const isPasswordValid = await argon2.verify(user.password, password);
			if (isPasswordValid) {
				// Delete the _id field from the user object
				delete user._id;
				return user;
			}
		}

		// User not found or password mismatch
		return null;
	}

	async logOut(session_id: string) {
		// Delete the session document
		await this.Session.deleteOne({ id: session_id });
	}

	async validateSession(session_id: string): Promise<User | null> {
		// Aggregate the Session collection to join with the User collection
		const resp = (
			await this.Session.aggregate([
				{
					$match: {
						id: session_id
					}
				},
				{
					$lookup: {
						from: this.User.collection.name,
						localField: 'user_id',
						foreignField: 'id',
						as: 'user'
					}
				},
				{
					$unwind: '$user'
				}
			])
		)?.[0];

		// If no session was found, return null
		if (!resp) return null;

		// Delete the _id field from the user object
		resp.user._id && delete resp.user._id;

		// Return the user object
		return resp.user;
	}

	async createToken(user_id: string, expires = 60 * 60 * 1000) {
		// Create a token
		return await createToken(this.Token, user_id, expires);
	}

	async validateToken(token: string, user_id: string) {
		// Validate the token
		return await validateToken(this.Token, token, user_id);
	}

	async consumeToken(token, user_id) {
		// Consume the token
		return await consumeToken(this.Token, token, user_id);
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
