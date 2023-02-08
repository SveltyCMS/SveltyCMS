import { SignUpToken } from '$lib/models/sign-up-token-model';
import { User } from '$lib/models/user-model';
import { fail, redirect, type Actions, json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import type { PageServerLoad } from './$types';
import sendMail from '$src/lib/utils/send-email';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.validate();
	if (!session) throw redirect(302, '/');

	const user = await User.find();
	return {
		user: JSON.stringify(user)
	};
};

export const actions: Actions = {
	generateToken: async ({ request, locals }) => {
		const form = await request.formData();

		const email = form.get('newUserEmail');
		const role = form.get('role');

		console.log({ email: email, role: role });

		if (!email || typeof email !== 'string' || !role) {
			return fail(400, {
				type: 'SIGN_UP_ERROR' as const,
				message: 'Invalid input'
			});
		}

		const tokenTable = await SignUpToken.count();
		const user = await User.findOne({ email: email });

		console.log({ user: user });

		if (tokenTable === 0) {
			await SignUpToken.createCollection();
		}

		if (user) {
			return fail(400, {
				type: 'SIGN_UP_ERROR' as const,
				message: 'Email already in use'
			});
		}
		const registrationToken = randomBytes(16).toString('base64');

		await SignUpToken.insertMany({
			email: email,
			role: role,
			resetRequestedAt: new Date(),
			resetToken: registrationToken
		}).catch((err) => console.error({ signUpTokenDb: err }));

		await sendMail(email, registrationToken);
	}
};
