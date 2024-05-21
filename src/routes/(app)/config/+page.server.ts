import { redirect } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import mongoose from 'mongoose';

export async function load(event: any) {
	// Secure this page with session cookie
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the user's session
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

	// If validation fails, redirect the user to the login page
	if (!user) {
		redirect(302, `/login`);
	}

	// Return user data
	return {
		props: {
			user: user
		}
	};
}
