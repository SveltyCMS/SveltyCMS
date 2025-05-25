/**
 * @file src/routes/api/sendMail/+server.ts
 * @description API endpoint for sending emails with customizable templates using svelte-email-tailwind.
 *
 * This module provides functionality to:
 * - Send emails using nodemailer
 * - Render email content using Svelte components styled with Tailwind CSS
 * - Support multiple email templates
 * - Handle internationalization for email content
 *
 * Features:
 * - Template-based email rendering with Tailwind CSS
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
import { json } from '@sveltejs/kit';

// svelte-email-tailwind
import { render } from 'svelte-email-tailwind';
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
	expiresIn?: string;
	expiresInLabel?: string;
	languageTag?: string;
	hostLink?: string;
	resetLink?: string;
	tokenLink?: string;
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

// Render email with HTML and plain text versions using svelte-email-tailwind
const renderEmailContent = async (component: EmailComponent, props?: EmailProps): Promise<RenderResult> => {
	try {
		// Use svelte-email-tailwind's render function
		const rendered = await render({
			template: component,
			props: props || {}
		});

		// svelte-email-tailwind should return HTML with proper DOCTYPE and styling
		const html = rendered;

		// Generate plain text version from HTML
		const text = convert(html, {
			wordwrap: 80,
			selectors: [
				{ selector: 'img', format: 'skip' },
				{ selector: '#__svelte-email-preview', format: 'skip' },
				{ selector: 'style', format: 'skip' },
				{ selector: 'head', format: 'skip' }
			]
		});

		return { html, text };
	} catch (error) {
		logger.error('Failed to render email template', { error: error instanceof Error ? error.message : 'Unknown error' });
		throw new Error(`Email template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
};

// Generate a standardized error response
function errorResponse(message: string, status: number = 500) {
	logger.error(message);
	return json({ success: false, error: message }, { status });
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, subject, message, templateName, props } = await request.json();
		const userLanguage = languageTag(); // Get the user's language
		logger.debug('Received email request', { email, subject, templateName });

		await sendMail(email, subject, message, templateName, props, userLanguage);
		return json({ success: true, message: 'Email sent successfully' });
	} catch (err) {
		const error = err as Error;
		return errorResponse(`Error sending email: ${error.message}`);
	}
};

// Send Email
async function sendMail(
	email: string,
	subject: string,
	message: string,
	templateName: keyof typeof templates,
	props: EmailProps,
	lang: string
) {
	// Validate SMTP configuration
	const requiredSmtpVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_EMAIL', 'SMTP_PASSWORD'];
	const missingVars = requiredSmtpVars.filter((varName) => !privateEnv[varName]);

	if (missingVars.length > 0) {
		throw new Error(`Missing required SMTP configuration: ${missingVars.join(', ')}`);
	}

	// Validate email format
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error('Invalid email address format');
	}

	// Validate template exists
	if (!templates[templateName]) {
		throw new Error(`Invalid email template: ${templateName}. Available templates: ${Object.keys(templates).join(', ')}`);
	}

	const smtpPort = Number(privateEnv.SMTP_PORT);

	// Configure SMTP settings based on port
	let secureOption = false;
	let requireTlsOption = true;

	if (smtpPort === 465) {
		secureOption = true;
		requireTlsOption = false;
	} else if (smtpPort === 587 || smtpPort === 25) {
		secureOption = false;
		requireTlsOption = true;
	}

	const transporter = nodemailer.createTransporter({
		host: privateEnv.SMTP_HOST,
		port: smtpPort,
		secure: secureOption,
		requireTLS: requireTlsOption,
		tls: {
			rejectUnauthorized: true
		},
		auth: {
			user: privateEnv.SMTP_EMAIL,
			pass: privateEnv.SMTP_PASSWORD
		},
		debug: process.env.NODE_ENV === 'development'
	});

	// Verify SMTP connection
	try {
		await transporter.verify();
		logger.info('SMTP connection verified successfully');
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		logger.error('SMTP connection failed', { error: errorMessage });
		throw new Error(`SMTP connection failed: ${errorMessage}`);
	}

	// Render email with both HTML and plain text
	const renderedEmail = await renderEmailContent(templates[templateName], {
		...props,
		languageTag: lang
	});

	const mailOptions: Mail.Options = {
		from: {
			address: privateEnv.SMTP_EMAIL!,
			name: props?.sitename || 'SveltyCMS'
		},
		to: email,
		subject,
		text: renderedEmail.text,
		html: renderedEmail.html
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully', {
			email,
			subject,
			messageId: info.messageId,
			templateName
		});
		return info;
	} catch (err) {
		const error = err as Error;
		logger.error('Error sending email', {
			error: error.message as LoggableValue,
			email,
			templateName
		});
		throw error;
	}
}