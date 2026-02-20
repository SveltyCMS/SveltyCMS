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

import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/api-handler';
import { type EmailTemplateProps, sendMail } from '@utils/email.server';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

// --- POST Handler ---
export const POST = apiHandler(async ({ request, locals }) => {
	const { user, tenantId, isAdmin } = locals;
	const { getPrivateSettingSync } = await import('@src/services/settings-service');

	// Check for internal API calls using a shared secret
	const internalKey = request.headers.get('x-internal-key');
	const systemSecret = getPrivateSettingSync('JWT_SECRET_KEY');
	const isAuthorizedInternal = internalKey && systemSecret && internalKey === systemSecret;

	// SECURITY: Only allow internal calls or authenticated admins
	if (!(isAuthorizedInternal || isAdmin)) {
		logger.warn('Unauthorized attempt to access /api/sendMail', {
			userId: user?._id,
			tenantId,
			hasInternalKey: !!internalKey
		});
		throw new AppError('Forbidden: Unauthorized access to email API.', 403, 'FORBIDDEN');
	}

	if (isAuthorizedInternal) {
		logger.debug('Authorized internal API call to /api/sendMail', { tenantId });
	} else {
		logger.debug(`Admin '${user?.email}' calling /api/sendMail`, { tenantId });
	}

	let requestBody: {
		recipientEmail: string;
		subject: string;
		templateName: string;
		props?: EmailTemplateProps;
		languageTag?: string;
	};

	try {
		requestBody = await request.json();
	} catch (error) {
		logger.error('Invalid JSON in request body:', { error, tenantId });
		throw new AppError('Invalid JSON in request body.', 400, 'INVALID_JSON');
	}

	const { recipientEmail, subject, templateName, props = {}, languageTag = 'en' } = requestBody;

	// Use the core utility to send the mail
	const result = await sendMail({
		recipientEmail,
		subject,
		templateName,
		props,
		languageTag
	});

	return json(result);
});
