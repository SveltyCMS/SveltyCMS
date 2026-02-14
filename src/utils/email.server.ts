/**
 * @file src/utils/email.server.ts
 * @description Reusable utility for rendering and sending emails using Svelte templates and Nodemailer.
 */

import type { ComponentType } from 'svelte';
import nodemailer from 'nodemailer';
import type { TransportOptions } from 'nodemailer';
import Renderer, { toPlainText } from 'better-svelte-email/render';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.server';
import { AppError } from '@utils/errorHandling';

// --- Dynamic Email Template Imports ---
const svelteEmailModules = import.meta.glob('/src/components/emails/*.svelte');

export interface EmailTemplateProps {
	sitename?: string;
	username?: string;
	email?: string;
	role?: string;
	token?: string;
	expires_in?: string;
	expiresIn?: string | Date;
	expiresInLabel?: string;
	hostLink?: string;
	resetLink?: string;
	tokenLink?: string;
	[key: string]: unknown;
}

export interface SendMailOptions {
	recipientEmail: string;
	subject: string;
	templateName: string;
	props?: EmailTemplateProps;
	languageTag?: string;
}

/**
 * Gets a specific email template component dynamically
 */
export async function getEmailTemplate(templateName: string): Promise<ComponentType | null> {
	const path = `/src/components/emails/${templateName}.svelte`;
	const moduleImporter = svelteEmailModules[path];

	if (moduleImporter) {
		try {
			const module = (await moduleImporter()) as any;
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

// Initialize the email renderer
const renderer = new Renderer();

/**
 * Renders a Svelte email component to HTML and plain text
 */
export const renderEmailToStrings = async (component: any, templateNameForLog: string, props?: EmailTemplateProps): Promise<RenderedEmailContent> => {
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

/**
 * Core function to send an email using Svelte templates and SMTP configuration from the database.
 */
export async function sendMail({ recipientEmail, subject, templateName, props = {}, languageTag = 'en' }: SendMailOptions) {
	if (!recipientEmail || !subject || !templateName) {
		throw new AppError('Missing required fields: recipientEmail, subject, or templateName.', 400);
	}

	const SelectedTemplateComponent = await getEmailTemplate(templateName);
	if (!SelectedTemplateComponent) {
		const availableTemplateNames = Object.keys(svelteEmailModules).map((path) => path.split('/').pop()?.replace('.svelte', ''));
		throw new AppError(`Invalid email template name: '${templateName}'. Available templates: ${availableTemplateNames.join(', ')}`, 400);
	}

	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		throw new AppError('Database adapter is not available', 500);
	}

	// Get SMTP configuration from database
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
		logger.warn('SMTP configuration incomplete. Email sending skipped.', { missingVars });
		return {
			success: false,
			message: 'SMTP settings not configured.',
			missing_config: missingVars
		};
	}

	// Check for placeholder host
	const dummyHost = String(smtpHost || '').toLowerCase();
	if (/dummy|example|\.invalid$/.test(dummyHost)) {
		logger.warn('SMTP host appears to be a placeholder; skipping email send.', { host: smtpHost });
		return { success: true, message: 'Skipped placeholder host.', dev_mode: true };
	}

	const templateProps = { ...props, languageTag };
	const { html, text } = await renderEmailToStrings(SelectedTemplateComponent, templateName, templateProps);

	const transporter = nodemailer.createTransport({
		host: smtpHost,
		port: Number(smtpPort),
		secure: Number(smtpPort) === 465,
		auth: { user: smtpUser, pass: smtpPass },
		tls: { rejectUnauthorized: process.env.NODE_ENV === 'development' ? false : true },
		debug: process.env.NODE_ENV === 'development'
	} as TransportOptions);

	const fromName = props?.sitename || 'SveltyCMS';
	const smtpMailFromResult = await dbAdapter.systemPreferences.get<string>('SMTP_MAIL_FROM', 'system');
	const mailFrom = (smtpMailFromResult?.success ? smtpMailFromResult.data : null) || smtpUser;

	const mailOptions = {
		from: `"${fromName}" <${mailFrom}>`,
		to: recipientEmail,
		subject: subject,
		text: text,
		html: html
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully:', { recipientEmail, subject, templateName, messageId: info.messageId });
		return { success: true, message: 'Email sent successfully.' };
	} catch (err) {
		const sendError = err as Error;
		logger.error('Nodemailer failed to send email:', { recipientEmail, subject, templateName, error: sendError.message });
		throw new AppError(`Email sending failed: ${sendError.message}`, 500);
	}
}
