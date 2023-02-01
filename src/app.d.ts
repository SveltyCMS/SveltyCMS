/// <reference types="lucia-auth" />
declare namespace Lucia {
	type Auth = import('$lib/server/lucia.js').Auth;

	type UserAttributes = {
		email: string;
		role: 'ADMIN' | 'DEVELOPER' | 'EDITOR' | 'USER';
		username: string | undefined;
		firstname: string | undefined;
		lastname: string | undefined;
		avatar: string | undefined;
		resetRequestedAt: Date | undefined;
		resetToken: string | undefined;
	};
}

/// <reference types="@sveltejs/kit" />
declare namespace App {
	interface Locals {
		validate: import('@lucia-auth/sveltekit').Validate;
		validateUser: import('@lucia-auth/sveltekit').ValidateUser;
		setSession: import('@lucia-auth/sveltekit').SetSession;
	}
}
