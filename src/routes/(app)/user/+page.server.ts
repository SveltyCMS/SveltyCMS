/**
 * @file src/routes/(app)/user/+page.server.ts
 * @description Server-side logic for the user page in the application.
 *
 * This module handles the server-side operations for the user page, including:
 * - Form validation for adding users and changing passwords
 * - Preparing data for client-side rendering
 *
 * Features:
 * - User and role information retrieval from event.locals
 * - Form handling with Superforms
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles form validation for the client-side rendering.
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

<<<<<<< HEAD
//superforms
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
=======
// Auth
import type { User, Role, Token } from '@src/auth/auth';
import type { PermissionConfig } from '@src/auth/permissions';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
>>>>>>> 69c53df49f438e29d4d10f3501b2b2667cbfa787
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { valibot } from 'sveltekit-superforms/adapters';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async (event) => {
	try {
		const user: User | null = event.locals.user;
		const roles: Role[] = event.locals.roles || [];
		const isFirstUser: boolean = event.locals.isFirstUser;
		const hasManageUsersPermission: boolean = event.locals.hasManageUsersPermission;

		// Validate forms using SuperForms
		const addUserForm = await superValidate(event, valibot(addUserTokenSchema));
		const changePasswordForm = await superValidate(event, valibot(changePasswordSchema));

<<<<<<< HEAD
	const AUTH_KEY = mongoose.models['auth_key'];
	// find user using id
	const userKey = await AUTH_KEY.findOne({ user_id: user.user.id });
	user.user.authMethod = userKey['_id'].split(':')[0];
	// If the user is not logged in, redirect them to the login page.
	if (user.status != 200) redirect(302, `/login`);

	user.user.authMethod = userKey['_id'].split(':')[0];
	// If the user is not logged in, redirect them to the login page.
	if (user.status != 200) redirect(302, `/login`);

	user.user.authMethod = userKey['_id'].split(':')[0];

	// Superforms Validate addUserForm / change Password
	const addUserForm = await superValidate(event, zod(addUserTokenSchema));
	const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

	// If user is authenticated, return the data for the page.
	return {
		allUsers,
		tokens,
		user: user.user,
		addUserForm,
		changePasswordForm,
		isFirstUser
	};
}

// This action adds a new user to the system.
export const actions: Actions = {
	addUser: async (event) => {
		// Validate addUserForm data
		const addUserForm = await superValidate(event, zod(addUserTokenSchema));

		const email = addUserForm.data.email;
		const role = addUserForm.data.role;
		const expiresIn = addUserForm.data.expiresIn;

		// Check if the email address is already registered.
		const key = await auth.getKey('email', email).catch(() => null);

		if (key) {
			return { form: addUserForm, message: 'This email is already registered' };
		}

		// Create new user with provided email and role
		const user = await auth.createUser({
			key: {
				providerId: 'email',
				providerUserId: email,
				password: null
			},
			attributes: {
				email: email,
				username: null,
				role: role,
				blocked: false
=======
		// Prepare user object for return, ensuring _id is a string
		const safeUser = user
			? {
				...user,
				_id: user._id.toString(),
				password: '[REDACTED]' // Ensure password is not sent to client
>>>>>>> 69c53df49f438e29d4d10f3501b2b2667cbfa787
			}
			: null;

		let adminData = null;

		if (user?.isAdmin || hasManageUsersPermission) {
			const allUsers: User[] = event.locals?.allUsers ?? [];
			const allTokens: Token[] = event.locals?.allTokens?.tokens ?? event.locals?.allTokens ?? [];

			// Format users and tokens for the admin area
			const formattedUsers = allUsers.map((user) => ({
				_id: user._id.toString(),
				blocked: user.blocked || false,
				avatar: user.avatar || null,
				email: user.email,
				username: user.username || null,
				role: user.role,
				activeSessions: user.lastActiveAt ? 1 : 0, // Placeholder for active sessions
				lastAccess: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null,
				createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
				updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null
			}));

			const formattedTokens = allTokens.map((token) => ({
				_id: token._id || token.user_id, // Use _id if available, fallback to user_id
				user_id: token.user_id,
				token: token.token || '', // Include the actual token value
				blocked: false, // Assuming tokens don't have a 'blocked' status
				email: token.email || '',
				role: token.type || 'user', // Use token type as role, default to 'user'
				expires: token.expires ? new Date(token.expires).toISOString() : null,
				createdAt: token.createdAt ? new Date(token.createdAt).toISOString() : null,
				updatedAt: token.updatedAt ? new Date(token.updatedAt).toISOString() : null
			}));

			adminData = {
				users: formattedUsers,
				tokens: formattedTokens
			};

		}

		// Provide manageUsersPermissionConfig to the client
		const manageUsersPermissionConfig: PermissionConfig = {
			contextId: 'config/userManagement',
			requiredRole: 'admin',
			action: 'manage',
			contextType: 'system'
		};

<<<<<<< HEAD
		if (!session) {
			return { form: addUserForm, message: 'Failed to create session' };
		}

		// Calculate expiration time in seconds based on expiresIn value
		let expirationTime: number;

		switch (expiresIn) {
			case '2 hrs':
				expirationTime = 2 * 60 * 60;
				break;
			case '12 hrs': //default expires value
				expirationTime = 12 * 60 * 60;
				break;
			case '2 days':
				expirationTime = 2 * 24 * 60 * 60;
				break;
			case '1 week':
				expirationTime = 7 * 24 * 60 * 60;
				break;
			default:
				// Handle invalid expiresIn value
				return { form: addUserForm, message: 'Invalid value for token validity' };
		}

		// Issue password token for new user
		const token = await createToken(user.id, 'register', expirationTime * 1000);
		// console.log(token);

		// Send the token to the user via email.
		await event.fetch('/api/sendMail', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: email,
				subject: 'userToken',
				message: 'userToken',
				templateName: 'userToken',
				props: {
					email: email,
					token: token,
					role: role,
					expiresIn: expirationTime
				}
			})
		});

		return { form: addUserForm };
	},

	// This action changes the password for the current user.
	changePassword: async (event) => {
		// Validate the form data.
		//console.log('changePassword');

		const changePasswordForm = await superValidate(event, zod(changePasswordSchema));
		const password = changePasswordForm.data.password;
		const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
		const user = await validate(auth, session);

		// The user's session is invalid.
		if (user.status != 200) {
			return { form: changePasswordForm, message: 'User does not exist or session expired' };
		}

		// Get the user's key.
		const key = (await auth.getAllUserKeys(user.user.id)).find((key) => key.passwordDefined == true);
		if (!key) return { form: changePasswordForm, message: 'User does not exist or session expired' };

		// Update the user's key password.
		await auth.updateKeyPassword('email', key.providerUserId, password);

		// Update the user's authentication method.
		const authMethod = 'password';
		await auth.updateUserAttributes(key.userId, { authMethod });

		// Return the form data.
		return { form: changePasswordForm };
	}
};

// Get all user Data for admin pages
async function getAllUsers() {
	const AUTH_KEY = mongoose.models['auth_key'];
	const AUTH_SESSION = mongoose.models['auth_session'];
	const AUTH_User = mongoose.models['auth_user'];
	const keys = await AUTH_KEY.find({});
	const users = [] as any;

	for (const key of keys) {
		const user = await auth.getUser(key['user_id']);
		if (user && (user as any).username == null) continue;

		if (user && (user as any).username == null) continue;

		user.email = (await AUTH_User.findOne({ _id: key['user_id'] })).email;
		let lastAccess = await AUTH_SESSION.findOne({ user_id: key['user_id'] }).sort({
			active_expires: -1
		});
		if (lastAccess) {
			lastAccess = lastAccess.toObject();
			delete lastAccess._id; // remove the _id property
			delete lastAccess.user_id; // remove the user_id property
			delete lastAccess.__v; // remove the __v property
		}

		user.lastAccess = lastAccess;
		user.activeSessions = await AUTH_SESSION.countDocuments({
			user_id: key['user_id'],
			active_expires: { $gt: Date.now() }
		});

		delete user.authMethod; // remove the authMethod property
		users.push(user);
	}

	//console.log(users);
	return users;
}

// Get all send Email Registration Tokens
async function getTokens() {
	const AUTH_User = mongoose.models['auth_user'];
	const AUTH_KEY = mongoose.models['auth_tokens'];
	// const tokens = await AUTH_KEY.find({ primary_key: false });
	const tokens = await AUTH_KEY.find({ type: 'register' });
	const userToken = [] as any;
	for (const token of tokens) {
		const tokenOBJ = token.toObject();
		delete tokenOBJ._id; // remove the _id property
		delete tokenOBJ.__v; // remove the __v property
		delete tokenOBJ.type; // remove the type property
		const user = await AUTH_User.findOne({ _id: token['userID'] });
		tokenOBJ.email = user?.email;
		tokenOBJ.role = user?.role;
		userToken.push(tokenOBJ);
	}

	return userToken;
}
=======
		// Return data to the client
		return {
			user: safeUser,
			roles: roles.map((role) => ({
				...role,
				_id: role._id.toString()
			})),
			addUserForm,
			changePasswordForm,
			isFirstUser,
			manageUsersPermissionConfig,
			adminData,
			permissions: {
				'config/adminArea': { hasPermission: user?.isAdmin || hasManageUsersPermission }
			}
		};
	} catch (err) {
		// Log error with an error code
		logger.error('Error during load function (ErrorCode: USER_LOAD_500):', err);
		throw error(500, 'Internal Server Error');
	}
};
>>>>>>> 69c53df49f438e29d4d10f3501b2b2667cbfa787
