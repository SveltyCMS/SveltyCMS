// svelte-email
import { render } from 'svelte-email';
import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private';

// Templates used by svelte email
import UserToken from '$lib/emails/userToken.svelte';
import Welcome from '$lib/emails/welcomeUser.svelte';
import ForgotPassword from '$lib/emails/forgottenPassword.svelte';
import UpdatedPassword from '$lib/emails/updatedPassword.svelte';

import nodemailer from 'nodemailer';

import type { ComponentType } from 'svelte';
import type { RequestHandler } from './$types';

interface EmailProps {
	sitename?: string;
	username?: string;
	email?: string;
	role?: string;
	token?: string;
	expires_at: string;
	expires_in?: string;
	// ... any other props used by both templates
}

const templates: Record<string, ComponentType> = {
	Welcome,
	UserToken,
	ForgotPassword,
	UpdatedPassword
};

export const POST: RequestHandler = async ({ request }) => {
	const { email, subject, message, templateName, props } = await request.json();
	await sendMail(email, subject, message, templateName, props);

	return new Response(null, { status: 200 });
};

async function sendMail(
	email: string,
	subject: string,
	message: string,
	templateName: keyof typeof templates,
	props: EmailProps
) {
	console.log(email, subject, message);
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

	await transporter
		.sendMail({
			from: SMTP_EMAIL,
			to: email,
			subject,
			text: message,
			html: emailHtml
		})
		.catch((err) => console.log(err));

	return {
		status: 200,
		body: { success: true }
	};
}
