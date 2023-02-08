import { SignUpToken } from '$lib/models/sign-up-token-model';
import { User } from '$lib/models/user-model';
import { fail, redirect, type Actions, json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.validate();
	if (!session) throw redirect(302, '/');

	const user = await User.find();
	console.log(user);
	return {
		user: JSON.stringify(user)
	};
};

export const actions: Actions = {
	generateToken: async ({ request, locals }) => {
		const form = await request.formData();

		const email = form.get('newUserEmail');
		const role = form.get('role'); //TO-DO set role on form

		console.log({ email: email, role: role });

		const tokenTable = await SignUpToken.count();
		const user = await User.findOne({ email: email });

		console.log({ dt: user });

		if (tokenTable === 0) {
			await SignUpToken.createCollection();
		}

		if (user) {
			return fail(400, {
				type: 'SIGN_UP_ERROR' as const,
				message: 'Email already in use'
			});
		}

		await SignUpToken.insertMany({
			email: email,
			role: role,
			resetRequestedAt: new Date(),
			resetToken: randomBytes(16).toString('base64')
		});
	}
};
