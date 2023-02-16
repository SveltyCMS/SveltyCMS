import nodemailer from 'nodemailer';

import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private';

/** Send email
 * @param {string} email - user email address
 *
 * @param {string} subject - Email subject
 * @param {string} message - Email message
 *
 *
 * Optional args: html - send html message to client
 * Suggest: Move secure to true (probably will need in future)
 */

// Send new pasword to the user email
async function sendMail(
	email: string,
	resetLink: string,
	callback: (error: Error | null, info: any) => void
) {
	const transporter = nodemailer.createTransport({
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: false, // true for 465, false for other ports
		auth: {
			user: SMTP_EMAIL, // generated ethereal user
			pass: SMTP_PASSWORD // generated ethereal password
		}
	});

	const emailOptions = {
		from: SMTP_EMAIL,
		to: email, // list of receivers
		subject: 'Password reset link for SimpleCMS', // Subject line
		html: `
			<p>Hello,</p>
			<p>Please click the following link to reset your password:</p>
			<p><a href="${resetLink}">${resetLink}</a></p>
			<p>If you did not request this reset, please ignore this email.</p>
		`
	};

	transporter.sendMail(emailOptions, (error, info) => {
		if (error) {
			callback(error, null);
			console.log({ error: error });
		} else {
			callback(null, info);
			console.log({ info: info });
		}
	});
}
