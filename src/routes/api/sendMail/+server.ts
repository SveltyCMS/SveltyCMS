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
import type { ComponentType }_ from 'svelte'; // For typing Svelte components

// Environment variables for SMTP configuration
import { privateEnv } from '../../../config/private'; // Adjusted path, verify based on your structure

// svelte-email-tailwind for rendering Svelte components to email HTML/text
import { render } from 'svelte-email-tailwind';

// Nodemailer for actual email sending
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer'; // For Mail.Options type

// System Logger
import { logger } from '@utils/logger.svelte';

// --- Email Template Imports ---
import WelcomeUserEmail from '@components/emails/welcomeUser.svelte'; 
import UserTokenEmail from '@components/emails/userToken.svelte';
import ForgottenPasswordEmail from '@components/emails/forgottenPassword.svelte'; 
import UpdatedPasswordEmail from '@components/emails/updatedPassword.svelte'; 
// Add other email components as needed

// Internationalization Placeholder
const getLanguageTagForUser = (props: any): string => {
	return props?.languageTag || 'en'; // Default to 'en' or get from props
};

// Props that your email templates might accept.
export interface EmailTemplateProps {
	sitename?: string;
	username?: string;
	email?: string; // This 'email' prop is for template data, distinct from recipient 'email'
	role?: string;
	token?: string;
	expires_in?: string;
	expiresIn?: string;
	expiresInLabel?: string;
	hostLink?: string;
	resetLink?: string;
	tokenLink?: string;
	// Add any other props your templates might use
	[key: string]: any; // Allow other props
}

// Map template names to Svelte components
const emailTemplates: Record<string, ComponentType<EmailTemplateProps>> = {
	welcomeUser: WelcomeUserEmail,
	userToken: UserTokenEmail,
	forgottenPassword: ForgottenPasswordEmail,
	updatedPassword: UpdatedPasswordEmail,
	// Add other templates here
};

type RenderedEmailContent = { html: string; text: string };

// Renders a Svelte email component to HTML and plain text
const renderEmailToStrings = async (
	component: ComponentType<EmailTemplateProps>,
	props?: EmailTemplateProps
): Promise<RenderedEmailContent> => {
	try {
		// `render` from `svelte-email-tailwind` generates both HTML and plain text.
		const { html, text } = render(component, { props });
		return { html, text };
	} catch (err) {
		const renderError = err as Error;
		logger.error('Failed to render email template to string:', {
			templateName: component.name, // May not always be available depending on component definition
			error: renderError.message,
			stack: renderError.stack
		});
		throw new Error(`Email template rendering failed: ${renderError.message}`);
	}
};

// Generates a standardized JSON error response
function createErrorResponse(message: string, status: number = 500) {
	logger.error(`API Error (${status}): ${message}`);
	throw svelteKitError(status, message);
}

// --- POST Handler ---
export const POST: RequestHandler = async ({ request, locals }) => {
	// API protection is handled by hooks.server.ts (auth and permissions)
	logger.debug(`User '${locals.user?.username || 'Unknown (hook issue or public access attempt)'}' calling /api/sendMail`);

	let requestBody: {
		recipientEmail: string;
		subject: string;
		templateName: string;
		props?: EmailTemplateProps;
	};

	try {
		requestBody = await request.json();
	} catch (e) {
		return createErrorResponse('Invalid JSON in request body.', 400);
	}

	const { recipientEmail, subject, templateName, props = {} } = requestBody;

	// Basic input validation
	if (!recipientEmail || !subject || !templateName) {
		return createErrorResponse('Missing required fields: recipientEmail, subject, or templateName.', 400);
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
		return createErrorResponse('Invalid recipient email address format.', 400);
	}
	if (!emailTemplates[templateName]) {
		return createErrorResponse(`Invalid email template name: '${templateName}'. Available templates: ${Object.keys(emailTemplates).join(', ')}`, 400);
	}

	const userLanguage = getLanguageTagForUser(props); // Determine language for the template if applicable
	logger.info('Processing email request via API:', { recipientEmail, subject, templateName });

	try {
		await sendEmailInternal(recipientEmail, subject, templateName, props, userLanguage);
		return json({ success: true, message: 'Email sent successfully.' });
	} catch (err) {
		const error = err as Error;
		// createErrorResponse handles logging, so just re-throw or call it
		return createErrorResponse(`Failed to send email: ${error.message}`, 500);
	}
};

/**
 * Core internal function to render and send an email.
 * @param recipientEmail The email address of the recipient.
 * @param subject The subject of the email.
 * @param templateName The key of the template in `emailTemplates`.
 * @param props The props to pass to the Svelte email component.
 * @param lang The language tag for the email (can be part of props).
 */
async function sendEmailInternal(
	recipientEmail: string,
	subject: string,
	templateName: keyof typeof emailTemplates,
	props: EmailTemplateProps,
	lang: string // lang can be used within props or directly if templates need it
) {
	// Validate SMTP configuration from privateEnv
	const requiredSmtpVars: (keyof typeof privateEnv)[] = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_EMAIL', 'SMTP_PASSWORD'];
	const missingVars = requiredSmtpVars.filter((varName) => !privateEnv[varName]);

	if (missingVars.length > 0) {
		logger.error('SMTP configuration is incomplete. Missing variables:', { missingVars });
		throw new Error(`Server SMTP configuration is incomplete. Email sending aborted.`);
	}

	const selectedTemplateComponent = emailTemplates[templateName];

	// Enhance props with language if your templates expect it directly
	const templateProps = {
		...props,
		languageTag: lang // Ensure languageTag is available for templates
	};

	// 1. Render email content (HTML and Text)
	const { html: emailHtml, text: emailText } = await renderEmailToStrings(
		selectedTemplateComponent,
		templateProps
	);

	// 2. Configure Nodemailer Transporter
	const smtpPort = Number(privateEnv.SMTP_PORT);
	const secureConnection = smtpPort === 465; // `secure` is true if port is 465

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
	if (process.env.NODE_ENV === 'development') { // Only verify in dev to avoid prod overhead
		try {
			await transporter.verify();
			logger.debug('SMTP connection verified successfully.');
		} catch (err) {
			const verifyError = err as Error;
			logger.warn('SMTP connection verification failed:', { error: verifyError.message });
		}
	}

	// 3. Define Mail Options
	const mailOptions: Mail.Options = {
		from: {
			name: props?.sitename || privateEnv.SMTP_FROM_NAME || 'SveltyCMS', // Use sitename from props, or fallback
			address: privateEnv.SMTP_EMAIL! // SMTP_EMAIL is validated above
		},
		to: recipientEmail,
		subject: subject,
		text: emailText,
		html: emailHtml
	};

	// 4. Send Email
	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully via Nodemailer:', {
			recipientEmail,
			subject,
			templateName,
			messageId: info.messageId,
			response: info.response
		});
	} catch (err) {
		const sendError = err as Error;
		logger.error('Nodemailer failed to send email:', {
			recipientEmail,
			subject,
			templateName,
			error: sendError.message,
			stack: sendError.stack
		});
		throw new Error(`Email sending failed: ${sendError.message}`); // Re-throw to be caught by POST handler
	}
}

