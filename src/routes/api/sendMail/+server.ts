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

// svelte-email-tailwind
import {
	createEmail,
	sendEmail,
	SendEmailFunction
} from 'svelte-email-tailwind/preview';

import nodemailer from 'nodemailer';

// Custom send function using your SMTP config
const sendUsingNodemailer: typeof SendEmailFunction = async ({ from, to, subject, html }) => {
	const transporter = nodemailer.createTransport({
		host: privateEnv.SMTP_HOST,
		port: Number(privateEnv.SMTP_PORT),
		secure: Number(privateEnv.SMTP_PORT) === 465,
		auth: {
			user: privateEnv.SMTP_EMAIL,
			pass: privateEnv.SMTP_PASSWORD
		}
	});

	const sent = await transporter.sendMail({ from, to, subject, html });

	if (sent.error) {
		return { success: false, error: sent.error };
	} else {
		return { success: true };
	}
};

export const actions = {
	...createEmail,
	...sendEmail({ customSendEmailFunction: sendUsingNodemailer })
};

