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

import { json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * SMTP Test Request Schema
 */
interface SMTPTestRequest {
	/** SMTP server hostname */
	host: string;
	/** SMTP server port (typically 587 for TLS, 465 for SSL) */
	port: number;
	/** SMTP username/email */
	user: string;
	/** SMTP password or app-specific password */
	password: string;
	/** Sender email address (optional, defaults to user) */
	from?: string;
	/** Email address to send test email to */
	testEmail: string;
	/** Whether to save settings to database */
	saveToDatabase?: boolean;
	/** Use TLS/STARTTLS (default: true) */
	secure?: boolean;
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
export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		// Parse request body
		const body: SMTPTestRequest = await request.json();
		const { host, port, user, password, from, testEmail, saveToDatabase, secure = true } = body;

		// Validate required fields
		if (!host || !port || !user || !password || !testEmail) {
			return json(
				{
					success: false,
					error: 'Missing required fields: host, port, user, password, testEmail'
				} as SMTPTestResponse,
				{ status: 400 }
			);
		}

		// Validate port is a number
		if (isNaN(port) || port < 1 || port > 65535) {
			return json(
				{
					success: false,
					error: 'Invalid port number. Must be between 1 and 65535.'
				} as SMTPTestResponse,
				{ status: 400 }
			);
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
						// Update privateEnv settings in database
						const settingsCollection = 'system_settings';

						// Update SMTP settings
						await dbAdapter.update(
							settingsCollection,
							{ key: 'SMTP_HOST' },
							{ key: 'SMTP_HOST', value: host, category: 'email', updatedAt: new Date() }
						);
						await dbAdapter.update(
							settingsCollection,
							{ key: 'SMTP_PORT' },
							{ key: 'SMTP_PORT', value: port.toString(), category: 'email', updatedAt: new Date() }
						);
						await dbAdapter.update(
							settingsCollection,
							{ key: 'SMTP_USER' },
							{ key: 'SMTP_USER', value: user, category: 'email', updatedAt: new Date() }
						);
						await dbAdapter.update(
							settingsCollection,
							{ key: 'SMTP_PASS' },
							{ key: 'SMTP_PASS', value: password, category: 'email', updatedAt: new Date() }
						);
						await dbAdapter.update(
							settingsCollection,
							{ key: 'SMTP_FROM' },
							{ key: 'SMTP_FROM', value: from || user, category: 'email', updatedAt: new Date() }
						);
						await dbAdapter.update(
							settingsCollection,
							{ key: 'SMTP_SECURE' },
							{ key: 'SMTP_SECURE', value: secure ? 'true' : 'false', category: 'email', updatedAt: new Date() }
						);

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

			return json(
				{
					success: false,
					error: errorMessage,
					latencyMs
				} as SMTPTestResponse,
				{ status: 400 }
			);
		}
	} catch (error: unknown) {
		logger.error('Unexpected error in SMTP test endpoint', { error });
		const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
		return json(
			{
				success: false,
				error: errorMessage
			} as SMTPTestResponse,
			{ status: 500 }
		);
	}
};
