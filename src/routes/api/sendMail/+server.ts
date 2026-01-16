/**
 * @file src/routes/api/sendMail/+server.ts
 * @description API endpoint for rendering and sending emails using Svelte templates and Nodemailer.
 *
 * This module provides functionality to:
 * - Receive a request to send an email based on a template.
 * - Render email content using Svelte components and better-svelte-email.
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
import type { ComponentType } from 'svelte';
import type { RequestHandler } from './$types';

// Database adapter for SMTP configuration
import { dbAdapter } from '@src/databases/db';

// Permissions

// Nodemailer for actual email sending
import nodemailer from 'nodemailer';
import type { TransportOptions } from 'nodemailer';

// System Logger
import { logger } from '@utils/logger.server';

// Better-svelte-email v1 Renderer
import Renderer from 'better-svelte-email/render';

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
async function getEmailTemplate(templateName: string): Promise<ComponentType | null> {
	const path = `/src/components/emails/${templateName}.svelte`;
	const moduleImporter = svelteEmailModules[path];

	if (moduleImporter) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const module = (await moduleImporter()) as any;
			// Assuming the default export is the Svelte component
			return module.default as ComponentType;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: any,
	templateNameForLog: string,
	props?: EmailTemplateProps
): Promise<RenderedEmailContent> => {
	try {
		// Use better-svelte-email v1 Renderer class
		const { render } = new Renderer();
		const html = await render(component, { props: props || {} });

		// Create a simple text version by stripping HTML tags
		const text = html
			.replace(/<[^>]*>/g, '')
			.replace(/\s+/g, ' ')
			.trim();

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
function createErrorResponse(message: string, status: number = 500): never {
	logger.error(`API Error in /api/sendMail (${status}): ${message}`);
	throw svelteKitError(status, message);
}

// --- POST Handler ---
export const POST: RequestHandler = async ({ request, locals }): Promise<Response> => {
	const { user, tenantId } = locals;
	// Check for internal API calls (from createToken API)
	const isInternalCall = request.headers.get('x-internal-call') === 'true';
	// Check sendMail permissions (skip for internal calls)
	if (!isInternalCall) {
		// Authentication is handled by hooks.server.ts - user presence confirms access

		logger.debug(`User '${user?.email || 'Unknown'}' calling /api/sendMail`, { tenantId });
	} else {
		logger.debug('Internal API call to /api/sendMail', { tenantId });
	}

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
		logger.error('Invalid JSON in request body:', { error, tenantId });
		return createErrorResponse('Invalid JSON in request body.', 400);
	}

	const { recipientEmail, subject, templateName, props = {}, languageTag = 'en' } = requestBody;
	// Basic input validation
	if (!recipientEmail || !subject || !templateName) {
		return createErrorResponse('Missing required fields: recipientEmail, subject, or templateName.', 400);
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
		return createErrorResponse('Invalid recipient email address format.', 400);
	} // 1. Get the email template component dynamically

	const SelectedTemplateComponent = await getEmailTemplate(templateName);
	if (!SelectedTemplateComponent) {
		const availableTemplateNames = Object.keys(svelteEmailModules).map((path) => path.split('/').pop()?.replace('.svelte', ''));
		return createErrorResponse(`Invalid email template name: '${templateName}'. Available templates: ${availableTemplateNames.join(', ')}`, 400);
	}

	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		return createErrorResponse('Database adapter is not available', 500);
	}

	// Validate SMTP configuration from database settings
	const smtpHostResult = await dbAdapter.systemPreferences.get<string>('SMTP_HOST', 'system');
	const smtpPortResult = await dbAdapter.systemPreferences.get<string>('SMTP_PORT', 'system');
	const smtpUserResult = await dbAdapter.systemPreferences.get<string>('SMTP_USER', 'system');
	const smtpPassResult = await dbAdapter.systemPreferences.get<string>('SMTP_PASS', 'system');

	const smtpHost = smtpHostResult?.success ? smtpHostResult.data : null;
	const smtpPort = smtpPortResult?.success ? smtpPortResult.data : null;
	const smtpUser = smtpUserResult?.success ? smtpUserResult.data : null;
	const smtpPass = smtpPassResult?.success ? smtpPassResult.data : null;

	const missingVars: string[] = [];
	if (!smtpHost) missingVars.push('SMTP_HOST');
	if (!smtpPort) missingVars.push('SMTP_PORT');
	if (!smtpUser) missingVars.push('SMTP_USER');
	if (!smtpPass) missingVars.push('SMTP_PASS');
	if (missingVars.length > 0) {
		logger.warn('SMTP configuration incomplete. Email sending skipped.', {
			missingVars,
			tenantId
		});
		return json({
			success: true,
			message: 'SMTP settings not configured. Please configure email settings in System Settings to enable email notifications.',
			dev_mode: true,
			missing_config: missingVars,
			smtp_not_configured: true,
			user_message: 'Email notifications are not configured yet. Please contact your administrator to set up SMTP settings.'
		});
	}

	// If SMTP host is a known dummy/placeholder, skip sending in dev-friendly way
	const dummyHost = String(smtpHost || '').toLowerCase();
	if (/dummy|example|\.invalid$/.test(dummyHost)) {
		logger.warn('SMTP host appears to be a placeholder; skipping email send.', { host: smtpHost, tenantId });
		return json({
			success: true,
			message: 'Email sending skipped due to dummy SMTP host (development mode).',
			dev_mode: true,
			dummy_host: smtpHost
		});
	}
	// Enhance props with languageTag if your templates expect it

	const templateProps = {
		...props,
		languageTag: languageTag
	};
	// 2. Render email content (HTML and Text)

	let emailHtml: string, emailText: string;
	try {
		const rendered = await renderEmailToStrings(SelectedTemplateComponent, templateName, templateProps);
		emailHtml = rendered.html;
		emailText = rendered.text;
	} catch (renderErr) {
		return createErrorResponse((renderErr as Error).message, 500);
	}
	// 3. Configure Nodemailer Transporter
	const smtpPortNum = Number(smtpPort);
	const secureConnection = smtpPortNum === 465;

	const transporter = nodemailer.createTransport({
		host: smtpHost,
		port: smtpPortNum,
		secure: secureConnection,
		auth: {
			user: smtpUser,
			pass: smtpPass
		},
		tls: {
			rejectUnauthorized: process.env.NODE_ENV === 'development' ? false : true
		},
		debug: process.env.NODE_ENV === 'development'
	} as TransportOptions);
	// 4. Define Mail Options

	const fromName = props?.sitename || 'SveltyCMS';
	const smtpMailFromResult = await dbAdapter.systemPreferences.get<string>('SMTP_MAIL_FROM', 'system');
	const mailFrom = (smtpMailFromResult?.success ? smtpMailFromResult.data : null) || smtpUser;
	const mailOptions = {
		from: `"${fromName}" <${mailFrom}>`,
		to: recipientEmail,
		subject: subject,
		text: emailText,
		html: emailHtml
	};
	// 5. Send Email
	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully via Nodemailer from /api/sendMail:', {
			recipientEmail,
			subject,
			templateName,
			messageId: info.messageId,
			tenantId
		});
		return json({ success: true, message: 'Email sent successfully.' });
	} catch (err) {
		const sendError = err as Error;
		logger.error('Nodemailer failed to send email from /api/sendMail:', {
			recipientEmail,
			subject,
			templateName,
			error: sendError.message,
			tenantId
		});
		return createErrorResponse(`Email sending failed: ${sendError.message}`, 500);
	}
};
