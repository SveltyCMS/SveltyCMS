import '$lib/models/user-model';
import '$lib/models/session-model';
import '$lib/models/key-model';
import '$lib/models/sign-up-token-model';

import lucia from 'lucia-auth';
import { dev } from '$app/environment';
import adapter from '@lucia-auth/adapter-mongoose';
import mongoose from 'mongoose';

export const auth = lucia({
	adapter: adapter(mongoose),

	//for production & cloned dev environment
	env: dev ? 'DEV' : 'PROD',
	autoDatabaseCleanup: true,
	transformUserData: (userData) => {
		return {
			userId: userData.id,
			email: userData.email,
			role: userData.role,
			username: userData.username,

			firstname: userData.firstname,
			lastname: userData.lastname,
			avatar: userData.avatar,

			resetRequestedAt: userData.resetRequestedAt,
			resetToken: userData.resetToken
		};
	}
});

export type Auth = typeof auth;
