import { privateEnv } from '@root/config/private';

// Svelty-email
import { render } from 'svelty-email';

// Templates used by svelty-email
import userToken from '@components/emails/userToken.svelte';
import welcomeUser from '@components/emails/welcomeUser.svelte';
import forgottenPassword from '@components/emails/forgottenPassword.svelte';
import updatedPassword from '@components/emails/updatedPassword.svelte';

// System Logs
import {logger} from '@src/utils/logger';

import nodemailer from 'nodemailer';

import type { ComponentType } from 'svelte';
import type { RequestHandler } from './$types';

// Paraglide
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
	const { email, subject, message, templateName, props } = await request.json();
	const userLanguage = languageTag(); // Get the user's language
	logger.debug('Received email request', { email, subject, templateName });

	try {
		await sendMail(email, subject, message, templateName, props, userLanguage);
		return new Response(null, { status: 200 });
	} catch (error) {
		logger.error('Error sending email:', error);
		return new Response('Failed to send email', { status: 500 });
	}
};

async function sendMail(email: string, subject: string, message: string, templateName: keyof typeof templates, props: EmailProps, lang: string) {
	const transporter = nodemailer.createTransport({
		host: privateEnv.SMTP_HOST,
		port: privateEnv.SMTP_PORT,
		secure: true,
		auth: {
			user: privateEnv.SMTP_EMAIL,
			pass: privateEnv.SMTP_PASSWORD
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
		from: privateEnv.SMTP_EMAIL,
		to: email,
		subject,
		text: message,
		html: emailHtml
	};

	try {
		const info = await transporter.sendMail(options);
		logger.info('Email sent successfully', { email, subject, messageId: info.messageId });
	} catch (err) {
		logger.error('Error sending email:', err);
		throw err;
	}
}
