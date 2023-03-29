import { render } from 'svelte-email';
import Hello from '$lib/emails/Hello.svelte';
import Welcome from '$lib/emails/welcomeUser.svelte';
import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private';

import nodemailer from 'nodemailer';

interface EmailProps {
	name?: string;
	sitename?: string;
	username?: string;
	// ... any other props used by both templates
}

const templates = {
	Hello,
	Welcome
};

export async function sendMail(
	email: string,
	subject: string,
	message: string,
	templateName: keyof typeof templates,
	props: EmailProps
) {
	// function sendMail(email, subject, message, html) {
	const transporter = nodemailer.createTransport({
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: true,
		// port: SMTP_PORT,
		// secure: false, // true for 465, false for other ports
		auth: {
			user: SMTP_EMAIL,
			pass: SMTP_PASSWORD
		}
	});

	const emailHtml = render({
		template: templates[templateName],
		props
	});

	await transporter.sendMail({
		from: SMTP_EMAIL,
		to: email,
		subject,
		text: message,
		html: emailHtml
	});

	return {
		status: 200,
		body: { success: true }
	};
}
