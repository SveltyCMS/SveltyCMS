import { render } from 'svelte-email';
import Hello from '$lib/emails/Hello.svelte';
import Welcome from '$lib/emails/welcomeUser.svelte';
import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private';
import type { RequestHandler } from './$types';

import nodemailer from 'nodemailer';
import type { ComponentType } from 'svelte';

interface EmailProps {
	name?: string;
	sitename?: string;
	username?: string;
	// ... any other props used by both templates
}

const templates: Record<string, ComponentType> = {
	Hello,
	Welcome
};

export const POST = (async ({ request }) => {
	const { email, subject, message, templateName, props } = await request.json();
	const x = await sendMail(email, subject, message, templateName, props);

	console.log(x);

	return { hello: 'world' };
}) satisfies RequestHandler;

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
