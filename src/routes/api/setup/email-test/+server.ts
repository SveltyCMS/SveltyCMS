/**
 * @file src/routes/api/setup/email-test/+server.ts
 * @description Tests SMTP configuration during setup and optionally saves settings to database.
 *
 * This endpoint allows users to:
 * 1. Test SMTP connection with provided credentials
 * 2. Send a test email to verify configuration
 * 3. Optionally save SMTP settings to the database
 *
 * @route POST /api/setup/email-test
 */

import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { safeParse } from 'valibot';
import { smtpConfigSchema, type SmtpConfigSchema } from '@utils/formSchemas';

/**
 * SMTP Test Request Schema
 */
interface SMTPTestRequest extends SmtpConfigSchema {
	/** Email address to send test email to */
	testEmail: string;
	/** Whether to save settings to database */
	saveToDatabase?: boolean;
}

/**
 * SMTP Test Response
 */
interface SMTPTestResponse {
	success: boolean;
	message?: string;
	error?: string;
	testEmailSent?: boolean;
	saved?: boolean;
	latencyMs?: number;
}

/**
 * POST /api/setup/email-test
 * Tests SMTP configuration and optionally saves to database
 */
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

/**
 * POST /api/setup/email-test
 * Tests SMTP configuration and optionally saves to database
 */
export const POST = apiHandler(async ({ request }) => {
	const startTime = Date.now();

	try {
		// Parse request body
		const body: SMTPTestRequest = await request.json();
		const { host, port, user, password, from, testEmail, saveToDatabase, secure = true } = body;

		// Validate required fields
		if (!testEmail) {
			throw new AppError('Missing required field: testEmail', 400, 'MISSING_EMAIL');
		}

		// Validate SMTP configuration using schema
		const smtpConfig: SmtpConfigSchema = { host, port, user, password, from: from || user, secure };
		const validationResult = safeParse(smtpConfigSchema, smtpConfig);

		if (!validationResult.success) {
			const errors = validationResult.issues.map((issue) => `${issue.path?.[0]?.key}: ${issue.message}`).join(', ');
			throw new AppError(`Invalid SMTP configuration: ${errors}`, 400, 'INVALID_SMTP_CONFIG');
		}

		logger.info('Testing SMTP configuration', { host, port, user, secure });

		// Create nodemailer transporter
		const transporter: Transporter = nodemailer.createTransport({
			host,
			port,
			secure: port === 465 ? true : secure, // Use SSL for port 465
			auth: {
				user,
				pass: password
			},
			// Connection timeout
			connectionTimeout: 10000, // 10 seconds
			greetingTimeout: 10000,
			socketTimeout: 10000
		});

		// Test connection
		try {
			await transporter.verify();
			const latencyMs = Date.now() - startTime;
			logger.info('✅ SMTP connection successful', { latencyMs });

			// Send test email to verify SMTP configuration
			await transporter.sendMail({
				from: from || user,
				to: testEmail,
				subject: 'SveltyCMS SMTP Test Email',
				text: `This is a test email from SveltyCMS.\n\nYour SMTP configuration is working correctly!\n\nHost: ${host}\nPort: ${port}\nUser: ${user}\n\nTimestamp: ${new Date().toISOString()}`,
				html: `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
						<h2 style="color: #2563eb;">SveltyCMS SMTP Test</h2>
						<p>This is a test email from SveltyCMS.</p>
						<p><strong>Your SMTP configuration is working correctly! ✅</strong></p>
						<hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
						<table style="width: 100%; border-collapse: collapse;">
							<tr>
								<td style="padding: 8px; font-weight: bold;">Host:</td>
								<td style="padding: 8px;">${host}</td>
							</tr>
							<tr>
								<td style="padding: 8px; font-weight: bold;">Port:</td>
								<td style="padding: 8px;">${port}</td>
							</tr>
							<tr>
								<td style="padding: 8px; font-weight: bold;">User:</td>
								<td style="padding: 8px;">${user}</td>
							</tr>
							<tr>
								<td style="padding: 8px; font-weight: bold;">Timestamp:</td>
								<td style="padding: 8px;">${new Date().toISOString()}</td>
							</tr>
						</table>
						<hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
						<p style="color: #6b7280; font-size: 12px;">
							This is an automated test email from your SveltyCMS installation.
						</p>
					</div>
				`
			});

			logger.info('✅ Test email sent successfully', { recipient: testEmail });

			// Save to database if requested
			let saved = false;
			if (saveToDatabase) {
				try {
					const { dbAdapter } = await import('@src/databases/db');

					if (!dbAdapter) {
						logger.warn('Database adapter not available, skipping save');
					} else {
						// Update SMTP settings
						await dbAdapter.systemPreferences.set('SMTP_HOST', host, 'system');
						await dbAdapter.systemPreferences.set('SMTP_PORT', port.toString(), 'system');
						await dbAdapter.systemPreferences.set('SMTP_USER', user, 'system');
						await dbAdapter.systemPreferences.set('SMTP_PASS', password, 'system');
						await dbAdapter.systemPreferences.set('SMTP_FROM', from || user, 'system');
						await dbAdapter.systemPreferences.set('SMTP_SECURE', secure ? 'true' : 'false', 'system');

						saved = true;
						logger.info('✅ SMTP settings saved to database');
					}
				} catch (dbError) {
					logger.error('Failed to save SMTP settings to database', { error: dbError });
					// Don't fail the entire request, connection test was successful
				}
			}

			return json(
				{
					success: true,
					message: `SMTP configuration verified successfully! Test email sent.${saved ? ' Settings saved.' : ''}`,
					testEmailSent: true,
					saved,
					latencyMs
				} as SMTPTestResponse,
				{ status: 200 }
			);
		} catch (connectionError: unknown) {
			const latencyMs = Date.now() - startTime;
			logger.error('❌ SMTP connection failed', { error: connectionError, latencyMs });

			// Parse error message for user-friendly response
			let errorMessage = 'SMTP connection failed';
			const err = connectionError as { code?: string; message?: string };
			if (err.code === 'EAUTH') {
				errorMessage = 'Authentication failed. Please check your username and password.';
			} else if (err.code === 'ECONNREFUSED') {
				errorMessage = 'Connection refused. Please check the host and port.';
			} else if (err.code === 'ETIMEDOUT') {
				errorMessage = 'Connection timed out. Please check your network and firewall settings.';
			} else if (err.code === 'ENOTFOUND') {
				errorMessage = 'Host not found. Please check the SMTP server address.';
			} else if (err.message) {
				errorMessage = err.message;
			}

			throw new AppError(errorMessage, 400, 'SMTP_CONNECTION_FAILED', { latencyMs });
		}
	} catch (error) {
		if (error instanceof AppError) throw error;
		logger.error('Unexpected error in SMTP test endpoint', { error });
		const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
		throw new AppError(errorMessage, 500, 'SMTP_TEST_FAILED');
	}
});
