/**
 * @file src/utils/email.server.ts
 * @description Reusable utility for rendering and sending emails using Svelte templates and Nodemailer.
 */

import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import Renderer, { toPlainText } from 'better-svelte-email/render';
import type { TransportOptions } from 'nodemailer';
import nodemailer from 'nodemailer';
import type { ComponentType } from 'svelte';

// --- Dynamic Email Template Imports ---
const svelteEmailModules = import.meta.glob('../components/emails/*.svelte');

export interface EmailTemplateProps {
	email?: string;
	expires_in?: string;
	expiresIn?: string | Date;
	expiresInLabel?: string;
	hostLink?: string;
	resetLink?: string;
	role?: string;
	sitename?: string;
	token?: string;
	tokenLink?: string;
	username?: string;
	[key: string]: unknown;
}

export interface SendMailOptions {
	languageTag?: string;
	props?: EmailTemplateProps;
	recipientEmail: string;
	subject: string;
	templateName: string;
}

/**
 * Gets a specific email template component dynamically
 */
export async function getEmailTemplate(templateName: string): Promise<ComponentType | null> {
	const normalizedSearch = `${templateName}.svelte`.toLowerCase();
	
	// Search through available modules for a match (case-insensitive and path-agnostic)
	const matchKey = Object.keys(svelteEmailModules).find(key => 
		key.toLowerCase().endsWith(normalizedSearch)
	);

	if (matchKey) {
		try {
			const moduleImporter = svelteEmailModules[matchKey];
			const module = (await moduleImporter()) as { default: ComponentType };
			return module.default as ComponentType;
		} catch (e) {
			logger.error(`Failed to import email template '${templateName}' from key '${matchKey}':`, e);
			return null;
		}
	}
	logger.warn(`Email template '${templateName}' not found. Available modules:`, Object.keys(svelteEmailModules));
	return null;
}

interface RenderedEmailContent {
	html: string;
	text: string;
}

// Initialize the email renderer
const renderer = new Renderer();

/**
 * Renders a Svelte email component to HTML and plain text
 */
export const renderEmailToStrings = async (
	component: ComponentType,
	templateNameForLog: string,
	props?: EmailTemplateProps
): Promise<RenderedEmailContent> => {
	try {
		const html = await renderer.render(component, { props: props || {} });
		const text = toPlainText(html);

		return { html, text };
	} catch (err) {
		const renderError = err as Error;
		logger.error('Failed to render email template to string:', {
			templateName: templateNameForLog,
			error: renderError.message,
			stack: renderError.stack
		});
		throw new AppError(`Email template '${templateNameForLog}' rendering failed: ${renderError.message}`, 500);
	}
};

async function getDbAdapter() {
	const { dbAdapter } = await import('@src/databases/db');
	return dbAdapter;
}

/**
 * Core function to send an email using Svelte templates and SMTP configuration from the database.
 */
export async function sendMail({ recipientEmail, subject, templateName, props = {}, languageTag = 'en' }: SendMailOptions) {
	if (!(recipientEmail && subject && templateName)) {
		throw new AppError('Missing required fields: recipientEmail, subject, or templateName.', 400);
	}

	const SELECTED_TEMPLATE_COMPONENT = await getEmailTemplate(templateName);
	if (!SELECTED_TEMPLATE_COMPONENT) {
		const availableTemplateNames = Object.keys(svelteEmailModules).map((path) => path.split('/').pop()?.replace('.svelte', ''));
		throw new AppError(`Invalid email template name: '${templateName}'. Available templates: ${availableTemplateNames.join(', ')}`, 400);
	}

	const dbAdapter = await getDbAdapter();
	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		throw new AppError('Database adapter is not available', 500);
	}

	// Get SMTP configuration from database
	const smtpHostResult = await dbAdapter.system.preferences.get<string>('SMTP_HOST', 'system');
	const smtpPortResult = await dbAdapter.system.preferences.get<string>('SMTP_PORT', 'system');
	const smtpUserResult = await dbAdapter.system.preferences.get<string>('SMTP_USER', 'system');
	const smtpPassResult = await dbAdapter.system.preferences.get<string>('SMTP_PASS', 'system');

	const smtpHost = smtpHostResult?.success ? smtpHostResult.data : null;
	const smtpPort = smtpPortResult?.success ? smtpPortResult.data : null;
	const smtpUser = smtpUserResult?.success ? smtpUserResult.data : null;
	const smtpPass = smtpPassResult?.success ? smtpPassResult.data : null;

	const missingVars: string[] = [];
	if (!smtpHost) {
		missingVars.push('SMTP_HOST');
	}
	if (!smtpPort) {
		missingVars.push('SMTP_PORT');
	}
	if (!smtpUser) {
		missingVars.push('SMTP_USER');
	}
	if (!smtpPass) {
		missingVars.push('SMTP_PASS');
	}

	if (missingVars.length > 0) {
		logger.warn('SMTP configuration incomplete. Email sending skipped.', {
			missingVars
		});
		return {
			success: false,
			message: 'SMTP settings not configured.',
			missing_config: missingVars
		};
	}

	// Check for placeholder host
	const dummyHost = String(smtpHost || '').toLowerCase();
	if (/dummy|example|\.invalid$/.test(dummyHost)) {
		logger.warn('SMTP host appears to be a placeholder; skipping email send.', {
			host: smtpHost
		});
		return {
			success: true,
			message: 'Skipped placeholder host.',
			dev_mode: true
		};
	}

	const templateProps = { ...props, languageTag };
	const { html, text } = await renderEmailToStrings(SELECTED_TEMPLATE_COMPONENT, templateName, templateProps);

	const transporter = nodemailer.createTransport({
		host: smtpHost,
		port: Number(smtpPort),
		secure: Number(smtpPort) === 465,
		auth: { user: smtpUser, pass: smtpPass },
		tls: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
		debug: process.env.NODE_ENV === 'development'
	} as TransportOptions);

	const fromName = props?.sitename || 'SveltyCMS';
	const smtpMailFromResult = await dbAdapter.system.preferences.get<string>('SMTP_MAIL_FROM', 'system');
	const mailFrom = (smtpMailFromResult?.success ? smtpMailFromResult.data : null) || smtpUser;

	const mailOptions = {
		from: `"${fromName}" <${mailFrom}>`,
		to: recipientEmail,
		subject,
		text,
		html
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully:', {
			recipientEmail,
			subject,
			templateName,
			messageId: info.messageId
		});
		return { success: true, message: 'Email sent successfully.' };
	} catch (err) {
		const sendError = err as Error;
		logger.error('Nodemailer failed to send email:', {
			recipientEmail,
			subject,
			templateName,
			error: sendError.message
		});
		throw new AppError(`Email sending failed: ${sendError.message}`, 500);
	}
}
