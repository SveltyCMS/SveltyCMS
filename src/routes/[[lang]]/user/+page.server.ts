import { SignUpToken } from '$lib/models/sign-up-token-model';
import { User } from '$lib/models/user-model';
import { fail, redirect, type Actions, json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import type { PageServerLoad } from './$types';
import sendMail from '$src/lib/utils/send-email';
import mongoose from 'mongoose';

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
		const expires_in = parseInt(form.get('expires_in') as string);

		const epoch_expires_at = new Date().getTime() + expires_in;

		if (!email || typeof email !== 'string' || !role) {
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'email',
						message: 'Invalid input'
					}
				]
			});
		}
		const tokenAlreadySentToUser = await SignUpToken.findOne({ email, role });
		if (tokenAlreadySentToUser) {
			// send already present token and update expiresAt
			try {
				tokenAlreadySentToUser.expiresAt = epoch_expires_at;
				await tokenAlreadySentToUser.save();
				await sendMail(email, 'New user registration', tokenAlreadySentToUser.resetToken);
			} catch (err) {
				return fail(400, {
					error: true,
					errors: [
						{
							field: 'email',
							message: 'Error sending mail'
						}
					]
				});
			}
		}

		const user = await User.findOne({ email: email });

		if (user) {
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'email',
						message: 'Email already in use'
					}
				]
			});
		}
		const registrationToken = randomBytes(16).toString('base64');

		try {
			await SignUpToken.create({
				_id: new mongoose.Types.ObjectId(),
				email: email,
				role: role,
				resetRequestedAt: new Date(),
				resetToken: registrationToken,
				expiresAt: epoch_expires_at
			});
		} catch (err) {
			console.error({ signUpTokenDb: err });
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'email',
						message: 'Error creating token'
					}
				]
			});
		}

		try {
			await sendMail(email, 'New user registration', registrationToken);
		} catch (err) {
			return fail(400, {
				error: true,
				errors: [
					{
						field: 'email',
						message: 'Error sending mail'
					}
				]
			});
		}
	}
};
