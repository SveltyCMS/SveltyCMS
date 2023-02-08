import nodemailer from 'nodemailer';

import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private';

async function sendMail(email: string, resetToken: string) {
	console.log(SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL);
	console.log(email, resetToken);
	const transporter = nodemailer.createTransport({
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: true, // true for 465, false for other ports
		auth: {
			user: SMTP_EMAIL, // generated ethereal user
			pass: SMTP_PASSWORD // generated ethereal password
		}
	});

	const info = await new Promise((resolve, reject) => {
		transporter.sendMail(
			{
				from: SMTP_EMAIL,
				to: email, // list of receivers
				subject: 'Password reset link for SimpleCMS', // Subject line
				text: `The rest token for the user: ${SMTP_EMAIL} is ${resetToken}` // plain text body
			},
			(err, info) => {
				if (err) {
					reject(err);
					console.log({ err: err });
				} else {
					resolve(info);
					console.log({ info: info });
				}
			}
		);
	});
	return info;
}

export default sendMail;
