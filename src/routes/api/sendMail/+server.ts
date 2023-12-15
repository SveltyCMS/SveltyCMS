// svelte-email
import { render } from 'svelte-email';
import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private';

// Templates used by svelte email
import userToken from '@components/emails/userToken.svelte';
import welcomeUser from '@components/emails/welcomeUser.svelte';
import forgottenPassword from '@components/emails/forgottenPassword.svelte';
import updatedPassword from '@components/emails/updatedPassword.svelte';

import nodemailer from 'nodemailer';

import type { ComponentType } from 'svelte';
import type { RequestHandler } from './$types';

// paraglide
import { languageTag } from '@src/paraglide/runtime';

interface EmailProps {
	sitename?: string;
	username?: string;
	email?: string;
	role?: string;
	token?: string;
	expires_in?: string;
	expiresInLabel?: string;
	languageTag?: string;
	// ... any other props used by both templates
}

const templates: Record<string, ComponentType> = {
	welcomeUser,
	userToken,
	forgottenPassword,
	updatedPassword
};

export const POST: RequestHandler = async ({ request }) => {
	// console.log(request);
	const { email, subject, message, templateName, props } = await request.json();
	const userLanguage = languageTag(); // Get the user's language
	await sendMail(email, subject, message, templateName, props, userLanguage);
	return new Response(null, { status: 200 });
};

async function sendMail(email: string, subject: string, message: string, templateName: keyof typeof templates, props: EmailProps, lang: string) {
	// console.log(email, subject, message);
	// function sendMail(email, subject, message, html) {
	const transporter = nodemailer.createTransport({
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: true,
		//service: 'gmail',

		// port: SMTP_PORT,
		// secure: false, // true for 465, false for other ports
		auth: {
			user: SMTP_EMAIL,
			pass: SMTP_PASSWORD
		}
	});

	const emailHtml = render({
		template: templates[templateName],
		props: {
			...props,
			languageTag: lang // Use the user's language
		}
	});

	const options = {
		from: SMTP_EMAIL,
		to: email,
		subject,
		text: message,
		html: emailHtml
	};

	//console.log(emailHtml);

	await transporter.sendMail(options).catch((err) => console.log(err));

	return {
		status: 200,
		body: { success: true }
	};
}
