/**
 * @file src/routes/api/sendMail/+server.ts
 * @description API endpoint for rendering and sending emails using Svelte templates and Nodemailer.
 *
 * This module provides functionality to:
 * - Receive a request to send an email based on a template.
 * - Render email content using Svelte components and svelte-email-tailwind.
 * - Send emails using Nodemailer with SMTP configuration from environment variables.
 * - Support multiple email templates and dynamic props.
 * - Handle internationalization for email content (basic structure).
 *
 * Features:
 * - Template-based email rendering with Tailwind CSS.
 * - SMTP configuration using environment variables.
 * - Support for plain text and HTML email content.
 * - Language-specific email content (via props and template logic).
 * - Robust error handling and logging.
 *
 * Usage:
 * POST /api/sendMail
 * Body (JSON):
 * {
 * "recipientEmail": "test@example.com",
 * "subject": "Your Subject Here",
 * "templateName": "welcomeUser", // Key from the 'templates' object
 * "props": { ... } // Props to pass to the Svelte email component
 * }
 *
 * Note: Ensure SMTP configuration (SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD)
 * is properly set in environment variables for successful email delivery.
 */

import { json, error as svelteKitError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ComponentType } from 'svelte';

// Environment variables for SMTP configuration
import { privateEnv } from '@root/config/private';

// Nodemailer for actual email sending
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

// System Logger
import { logger } from '@utils/logger.svelte';

// Svelte SSR rendering
import { render } from 'svelte/server';

// --- Dynamic Email Template Imports ---
// This will find all .svelte files in the specified directory
const svelteEmailModules = import.meta.glob('/src/components/emails/*.svelte');

// Props that your email templates might accept.
export interface EmailTemplateProps {
	sitename?: string;
	username?: string;
	email?: string; // This 'email' prop is for template data, distinct from recipient 'email'
	role?: string;
	token?: string;
	expires_in?: string;
	expiresIn?: string | Date; // Can be string or Date
	expiresInLabel?: string;
	hostLink?: string;
	resetLink?: string;
	tokenLink?: string;
	// Add any other props your templates might use
	[key: string]: unknown; // Allow other props
}

// Function to get a specific email template component dynamically
async function getEmailTemplate(templateName: string): Promise<ComponentType<EmailTemplateProps> | null> {
	const path = `/src/components/emails/${templateName}.svelte`;
	const moduleImporter = svelteEmailModules[path];

	if (moduleImporter) {
		try {
			const module = await moduleImporter();
			// Assuming the default export is the Svelte component
			return (module as unknown).default as ComponentType<EmailTemplateProps>;
		} catch (e) {
			logger.error(`Failed to import email template '${templateName}' from path '${path}':`, e);
			return null;
		}
	}
	logger.warn(`Email template '${templateName}' not found at path '${path}'. Available modules:`, Object.keys(svelteEmailModules));
	return null;
}


type RenderedEmailContent = { html: string; text: string };

// Renders a Svelte email component to HTML and plain text
const renderEmailToStrings = async (
	component: ComponentType<EmailTemplateProps>,
	templateNameForLog: string,
	props?: EmailTemplateProps
): Promise<RenderedEmailContent> => {
	try {
		// Use Svelte's server-side render function
		const result = render(component, { props: props || {} });

		// Extract HTML and create a simple text version
		const html = result.body;
		// Create a simple text version by stripping HTML tags
		const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

		return { html, text };
	} catch (err) {
		const renderError = err as Error;
		logger.error('Failed to render email template to string:', {
			templateName: templateNameForLog,
			error: renderError.message,
			stack: renderError.stack
		});
		throw new Error(`Email template '${templateNameForLog}' rendering failed: ${renderError.message}`);
	}
};

// Generates a standardized JSON error response
function createErrorResponse(message: string, status: number = 500) {
	logger.error(`API Error in /api/sendMail (${status}): ${message}`);
	throw svelteKitError(status, message);
}

// --- POST Handler ---
export const POST: RequestHandler = async ({ request, locals }) => {
	logger.debug(`User '${locals.user?.username || 'Unknown (hook issue or public access attempt)'}' calling /api/sendMail`);

	let requestBody: {
		recipientEmail: string;
		subject: string;
		templateName: string;
		props?: EmailTemplateProps;
		languageTag?: string; // Optional language tag from client
	};

	try {
		requestBody = await request.json();
	} catch (error) {
		logger.error('Invalid JSON in request body:', error);
		return createErrorResponse('Invalid JSON in request body.', 400);
	}

	const { recipientEmail, subject, templateName, props = {}, languageTag = 'en' } = requestBody;

	// Basic input validation
	if (!recipientEmail || !subject || !templateName) {
		return createErrorResponse('Missing required fields: recipientEmail, subject, or templateName.', 400);
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
		return createErrorResponse('Invalid recipient email address format.', 400);
	}

	logger.info('Processing email request via API:', { recipientEmail, subject, templateName, lang: languageTag });

	// 1. Get the email template component dynamically
	const SelectedTemplateComponent = await getEmailTemplate(templateName);
	if (!SelectedTemplateComponent) {
		const availableTemplateNames = Object.keys(svelteEmailModules).map(path => path.split('/').pop()?.replace('.svelte', ''));
		return createErrorResponse(`Invalid email template name: '${templateName}'. Available templates: ${availableTemplateNames.join(', ')}`, 400);
	}

	// Validate SMTP configuration from privateEnv
	const requiredSmtpVars: (keyof typeof privateEnv)[] = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_EMAIL', 'SMTP_PASSWORD'];
	const missingVars = requiredSmtpVars.filter((varName) => !privateEnv[varName]);

	if (missingVars.length > 0) {
		logger.error('SMTP configuration is incomplete in /api/sendMail. Missing variables:', { missingVars });
		return createErrorResponse(`Server SMTP configuration is incomplete. Email sending aborted.`, 500);
	}

	// Enhance props with languageTag if your templates expect it (they should get it from svelte-email-tailwind's render context or directly)
	const templateProps = {
		...props,
		languageTag: languageTag // Ensure languageTag is consistently available
	};

	// 2. Render email content (HTML and Text)
	let emailHtml: string, emailText: string;
	try {
		const rendered = await renderEmailToStrings(SelectedTemplateComponent, templateName, templateProps);
		emailHtml = rendered.html;
		emailText = rendered.text;
	} catch (renderErr) {
		// renderEmailToStrings already logs, createErrorResponse will also log.
		return createErrorResponse((renderErr as Error).message, 500);
	}


	// 3. Configure Nodemailer Transporter
	const smtpPort = Number(privateEnv.SMTP_PORT);
	const secureConnection = smtpPort === 465;

	const transporter = nodemailer.createTransport({
		host: privateEnv.SMTP_HOST,
		port: smtpPort,
		secure: secureConnection,
		auth: {
			user: privateEnv.SMTP_EMAIL,
			pass: privateEnv.SMTP_PASSWORD
		},
		tls: {
			// For production, it should be true (or omitted, as true is default).
			rejectUnauthorized: process.env.NODE_ENV === 'development' ? false : true
		},
		debug: process.env.NODE_ENV === 'development' // Enable Nodemailer debug logs in development
	});

	// Optional: Verify SMTP connection (can be slow, use judiciously)
	if (process.env.NODE_ENV === 'development') {
		try {
			await transporter.verify();
			logger.debug('SMTP connection verified successfully by /api/sendMail.');
		} catch (err) {
			const verifyError = err as Error;
			logger.warn('SMTP connection verification failed in /api/sendMail:', { error: verifyError.message });
		}
	}

	// 4. Define Mail Options
	const mailOptions: Mail.Options = {
		from: {
			name: props?.sitename || privateEnv.SMTP_FROM_NAME || 'SveltyCMS',
			address: privateEnv.SMTP_EMAIL!
		},
		to: recipientEmail,
		subject: subject,
		text: emailText,
		html: emailHtml
	};

	// 5. Send Email
	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully via Nodemailer from /api/sendMail:', {
			recipientEmail, subject, templateName, messageId: info.messageId, response: info.response
		});
		return json({ success: true, message: 'Email sent successfully.' });
	} catch (err) {
		const sendError = err as Error;
		logger.error('Nodemailer failed to send email from /api/sendMail:', {
			recipientEmail, subject, templateName, error: sendError.message, stack: sendError.stack
		});
		return createErrorResponse(`Email sending failed: ${sendError.message}`, 500);
	}
};

