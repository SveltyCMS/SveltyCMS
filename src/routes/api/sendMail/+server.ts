/**
 * @file src/routes/api/sendMail/+server.ts
 * @description API endpoint for sending emails with customizable templates.
 *
 * This module provides functionality to:
 * - Send emails using nodemailer
 * - Render email content using Svelte components
 * - Support multiple email templates
 * - Handle internationalization for email content
 *
 * Features:
 * - Template-based email rendering
 * - SMTP configuration using environment variables
 * - Support for plain text and HTML email content
 * - Language-specific email content
 * - Error handling and logging
 *
 * Usage:
 * POST /api/sendMail
 * Body: JSON object with 'email', 'subject', 'message', 'templateName', and 'props'
 *
 * Note: Ensure SMTP configuration is properly set in environment variables
 * for successful email delivery.
 */

import { privateEnv } from '@root/config/private';

// Svelty-email
import { render } from 'svelty-email';

import nodemailer from 'nodemailer';

// ParaglideJS
import { languageTag } from '@src/paraglide/runtime';

// System Logger
import logger from '@src/utils/logger';

// Email templates
import userToken from '@components/emails/userToken.svelte';
import welcomeUser from '@components/emails/welcomeUser.svelte';
import forgottenPassword from '@components/emails/forgottenPassword.svelte';
import updatedPassword from '@components/emails/updatedPassword.svelte';

// Types
import type { ComponentType } from 'svelte';
import type { RequestHandler } from './$types';
import type Mail from 'nodemailer/lib/mailer';

interface EmailProps {
	sitename?: string;
	username?: string;
	email?: string;
	role?: string;
	token?: string;
	expires_in?: string;
	expiresInLabel?: string;
	languageTag?: string;
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
	logger.info('Received email request', { email, subject, templateName });

	try {
		await sendMail(email, subject, message, templateName, props, userLanguage);
		return new Response('Email sent successfully', { status: 200 });
	} catch (error) {
		logger.error('Error sending email:', error);
		return new Response('Failed to send email', { status: 500 });
	}
};

// Send Email
async function sendMail(email: string, subject: string, message: string, templateName: keyof typeof templates, props: EmailProps, lang: string) {
	const transporter = nodemailer.createTransport({
		host: privateEnv.SMTP_HOST,
		secure: true,
		tls: {
			ciphers: "SSLv3",
		},
		requireTLS: true,
		port: 465,
		debug: true,
		auth: {
			user: privateEnv.SMTP_EMAIL,
			pass: privateEnv.SMTP_PASSWORD,
		}
	});

	const emailHtml = render({
		template: templates[templateName],
		props: { ...props, languageTag: lang }
	});

	const mailOptions: Mail.Options = {
		from: {
			address: privateEnv.SMTP_EMAIL!,
			name: "Svelty CMS",
		},
		to: email,
		subject,
		text: message,
		html: emailHtml
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully', { email, subject, messageId: info.messageId });
	} catch (error) {
		logger.error('Error sending email:', error);
		throw error;
	}
}
