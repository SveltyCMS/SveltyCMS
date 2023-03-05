import nodemailer from 'nodemailer';

import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private';

/** Send email
 * @param {string} email - user email address
 *
 * @param {string} subject - Email subject
 * @param {string} message - Email message
 *
 * Optional args: html - send html message to client
 * Suggest: Move secure to true (probably will need in future)
 */

async function sendMail(email: string, subject: string, message: string, html?: string) {
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
		subject: subject, // Subject line
		text: message, // plain text body
		html: html // optionally include an HTML message
	};

	const info = await transporter.sendMail(emailOptions);
	return info;
}

export default sendMail;
