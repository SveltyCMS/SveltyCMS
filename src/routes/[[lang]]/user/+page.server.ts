import { SignUpToken } from '$lib/models/sign-up-token-model';
import { User } from '$lib/models/user-model';
import { fail, redirect, type Actions, json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import type { PageServerLoad } from './$types';
//import sendMail from '$src/lib/utils/send-email';
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
	generateToken: async (event) => {
		const form = await event.request.formData();

		const email = form.get('newUserEmail').toLowerCase();
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

		// Check if a token has already been sent to the user with the given email
		const tokenAlreadySentToUser = await SignUpToken.findOne({ email });
		if (tokenAlreadySentToUser) {
			try {
				tokenAlreadySentToUser.expiresAt = epoch_expires_at; // Update the expiresAt field of the existing token
				tokenAlreadySentToUser.role = role; // Update the role field of the existing token
				await tokenAlreadySentToUser.save(); // Save the changes to the database

				//Send New user registration mail
				await event.fetch('/api/sendMail', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						email: email,
						subject: 'New user registration',
						message: 'New user registration',
						templateName: 'UserToken',
						props: {
							//username: username,
							email: email,
							token: tokenAlreadySentToUser.resetToken
							// role: role,
							// resetLink: link,
							//expires_at: epoch_expires_at
						}
					})
				});
			} catch (err) {
				console.log('err', err);
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

		//Send New user registration mail
		try {
			await event.fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email,
					subject: 'New user registration',
					message: 'New user registration',
					templateName: 'UserToken',
					props: {
						//username: username,
						email: email,
						token: registrationToken,
						role: role,
						// resetLink: link,
						expires_at: epoch_expires_at
					}
				})
			});
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

// ```
// export const actions: Actions = {
// 	generateToken: async ({ request, locals }) => {
// 		const form = await request.formData();

// 		const email = form.get('newUserEmail').toLowerCase();
// 		const role = form.get('role');
// 		const expires_in = parseInt(form.get('expires_in') as string);

// 		const epoch_expires_at = new Date().getTime() + expires_in;

// 		if (!email || typeof email !== 'string' || !role) {
// 			return fail(400, {
// 				error: true,
// 				errors: [
// 					{
// 						field: 'email',
// 						message: 'Invalid input'
// 					}
// 				]
// 			});
// 		}

//         // Find any existing sign-up tokens for the user
//         const existingToken = await SignUpToken.findOne({ email, role });

//         // If an existing token is found, update its values
//         if (existingToken) {
//             existingToken.resetRequestedAt = new Date();
//             existingToken.resetToken = randomBytes(16).toString('base64');
//             existingToken.expiresAt = epoch_expires_at;
//             await existingToken.save();
//         } else {
//             // If no existing token is found, create a new one
//             const signUpToken = new SignUpToken({
//                 email,
//                 role,
//                 resetRequestedAt: new Date(),
//                 resetToken: randomBytes(16).toString('base64'),
//                 expiresAt: epoch_expires_at
//             });
//             await signUpToken.save();
//         }

//         // Send the email with the reset token
//         try {
//             await sendMail(email, 'New user registration', existingToken ? existingToken.resetToken : signUpToken.resetToken);
//         } catch (err) {
//             console.log('err', err);
//             return fail(400, {
//                 error: true,
//                 errors: [
//                     {
//                         field: 'email',
//                         message: 'Error sending mail'
//                     }
//                 ]
//             });
//         }

//         return json({ success: true });
//     }
// };
// ```;
