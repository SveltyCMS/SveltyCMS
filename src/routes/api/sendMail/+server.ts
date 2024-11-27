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
import { publicEnv } from '@root/config/public';
import { json } from '@sveltejs/kit';

// Svelte
import { render } from 'svelte/server';
import { convert } from 'html-to-text';

import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

// ParaglideJS
import { languageTag } from '@src/paraglide/runtime';

// System Logger
import { logger } from '@utils/logger.svelte';
import type { LoggableValue } from '@utils/logger.svelte';

// Email templates
import userToken from '@components/emails/userToken.svelte';
import welcomeUser from '@components/emails/welcomeUser.svelte';
import forgottenPassword from '@components/emails/forgottenPassword.svelte';
import updatedPassword from '@components/emails/updatedPassword.svelte';

// Types
import type { ComponentType } from 'svelte';
import type { RequestHandler } from './$types';

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

// Types for email rendering
type EmailComponent = ComponentType<EmailProps>;
type RenderResult = { html: string; text: string };

// Render email with HTML and plain text versions
const renderEmail = async (component: EmailComponent, props?: EmailProps): Promise<RenderResult> => {
	const rendered = render(component, {
		props
	});

	const doctype = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

	const html = `${doctype}${rendered.body}`;

	const text = convert(rendered.body, {
		selectors: [
			{ selector: 'img', format: 'skip' },
			{ selector: '#__svelte-email-preview', format: 'skip' }
		]
	});

	return {
		html,
		text
	};
};

// Generate a standardized error response
function errorResponse(message: string, status: number = 500) {
	logger.error(message);
	return json({ success: false, error: message }, { status });
}

export const POST: RequestHandler = async ({ request }) => {
	const { email, subject, message, templateName, props } = await request.json();
	const userLanguage = languageTag(); // Get the user's language
	logger.debug('Received email request', { email, subject, templateName });

	try {
		await sendMail(email, subject, message, templateName, props, userLanguage);
		return json({ success: true, message: 'Email sent successfully' });
	} catch (err) {
		const error = err as Error;
		return errorResponse(`Error sending email: ${error.message}`);
	}
};

// Send Email
async function sendMail(email: string, subject: string, message: string, templateName: keyof typeof templates, props: EmailProps, lang: string) {
	const transporter = nodemailer.createTransport({
		host: privateEnv.SMTP_HOST,
		secure: true,
		tls: {
			ciphers: 'SSLv3'
		},
		requireTLS: true,
		port: privateEnv.SMTP_PORT,
		debug: true,
		auth: {
			user: privateEnv.SMTP_EMAIL,
			pass: privateEnv.SMTP_PASSWORD
		}
	});

	// Render email with both HTML and plain text
	const renderedEmail = await renderEmail(templates[templateName], {
		...props,
		languageTag: lang
	});

	const mailOptions: Mail.Options = {
		from: {
			address: privateEnv.SMTP_EMAIL!,
			name: publicEnv.SITE_NAME
		},
		to: email,
		subject,
		text: renderedEmail.text,
		html: renderedEmail.html
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully', { email, subject, messageId: info.messageId });
	} catch (err) {
		const error = err as Error;
		logger.error('Error sending email:', { error: error.message as LoggableValue });
		throw error;
	}
}
