import type { RequestHandler } from './$types';
import { auth } from '@api/db';
import mongoose from 'mongoose';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { validate } from '@utils/utils';

// Define a POST request handler function
export const POST: RequestHandler = async ({ request, cookies }) => {
	const data = await request.json();
	const userID = data.id || data.userId;
	let username = data.username;
	const email = data.email;
	const password = data.password;
	const confirmPassword = data.confirmPassword;
	const role = data.role;

	if (password !== confirmPassword) return new Response(JSON.stringify('passwords do not match'), { status: 400 });
	if (!username) return new Response(JSON.stringify('username is required'), { status: 400 });

	if (username.length < 2) return new Response(JSON.stringify('username must be at least 2 characters'), { status: 400 });
	if (username.length > 24) return new Response(JSON.stringify('username must be at most 24 characters'), { status: 400 });
	username = username.trim();

	// const user = await auth.getUser(userID);
	const key = await auth.getKey('email', email).catch(() => null);

	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the user's session.
	const currentUser = await validate(auth, session);

	if (key && password) {
		auth.invalidateAllUserSessions(userID);
		auth.updateKeyPassword('email', key.providerUserId, password);
	}

	//update user role
	if (role) {
		if (role !== 'admin') {
			const AUTH_USER = mongoose.models['auth_user'];
			const adminLength = (await AUTH_USER.find({ role: 'admin' })).length;
			if (adminLength <= 1) return new Response(JSON.stringify('There must be at least one admin'), { status: 400 });
		}
		// update user role
		await auth.invalidateAllUserSessions(userID);
		await auth.updateUserAttributes(userID, { role });
	}

	await auth.updateUserAttributes(userID, { username });

	if (currentUser.status !== 200) return new Response(JSON.stringify('User does not exist or session expired'), { status: 400 });
	if (currentUser.user.id == userID) {
		// make another session
		const session = await auth.createSession({
			userId: userID,
			attributes: {}
		});
		const sessionCookie = auth.createSessionCookie(session);
		cookies.set(sessionCookie.name, sessionCookie.value, { path: '/' });
	}

	return new Response(JSON.stringify('success'), { status: 200 });
};
