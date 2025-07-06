/**
@file  cli-installer/config/email.js
@description Configuration prompts for the Email section

### Features
- Displays a detailed note about the Email configuration's importance.
- **Notes that email configuration can be changed later.**
- Offers different email configuration modes: Real SMTP, Development/Testing (Dummy), or Skip.
- Guides user towards dedicated transactional services for production.
- Guides user through configuration based on selected mode.
- Displays existing configuration (password hidden) if available.
- Prompts for Email integration (Real SMTP mode).
- Tests SMTP connection (Real SMTP mode only).
- Provides option to re-enter details if connection fails (Real SMTP mode).
- Adds specific warnings about feature limitations in Dev/Testing mode, **including suitability for single-admin setups.**
*/

import { confirm, isCancel, note, password, select, spinner, text } from '@clack/prompts';
import nodemailer from 'nodemailer';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

// Common providers and the Custom option
const emailProviders = [
	{ name: 'Custom Provider', host: '', port: 587 },
	{ name: 'Gmail', host: 'smtp.gmail.com', port: 587 },
	{ name: 'GMX', host: 'smtp.gmx.com', port: 587 },
	{ name: 'iCloud', host: 'smtp.mail.me.com', port: 587 },
	{ name: 'Outlook', host: 'smtp.office365.com', port: 587 },
	{ name: 'T-Online', host: 'smtp.t-online.de', port: 587 },
	{ name: 'Web.de', host: 'smtp.web.de', port: 587 },
	{ name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587 },
	{ name: 'Zoho', host: 'smtp.zoho.com', port: 587 }
];

// Helper function to validate email format
const validateEmail = (value) => {
	if (!value) return `Email address is required.`;
	// Basic email format check
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(value)) {
		return `Please enter a valid email address.`;
	}
	return undefined; // Valid
};

// Helper function to test SMTP connection (only used for Real SMTP mode)
async function testSmtpConnection({ host, port, user, pass }) {
	const transporter = nodemailer.createTransport({
		host: host,
		port: parseInt(port, 10),
		secure: parseInt(port, 10) === 465, // true for 465, false for other ports (usually STARTTLS on 587)
		auth: {
			user: user,
			pass: pass
		},
		tls: {
			rejectUnauthorized: process.env.NODE_ENV === 'production'
		}
	});

	try {
		await transporter.verify();
		return true;
	} catch (error) {
		console.error('SMTP connection error details:', error);
		return `SMTP connection failed: ${error.message}`;
	}
}

export async function configureEmail(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	note(
		`${pc.yellow('Email configuration is crucial for core CMS features:')}
  • User registration and account activation
  • Password reset functionality
  • Important notifications and alerts

Choose your email setup mode based on your needs.`,
		pc.green('Email Configuration:')
	);

	// Display existing configuration (excluding password)
	if (privateConfigData.SMTP_HOST || privateConfigData.SMTP_DEV_MODE || privateConfigData.SMTP_SKIPPED) {
		note(
			`Current Email Status: ${
				privateConfigData.SMTP_DEV_MODE
					? pc.yellow('Development/Testing Mode')
					: privateConfigData.SMTP_SKIPPED
						? pc.yellow('Skipped')
						: pc.green('Configured')
			}\n` +
				(privateConfigData.SMTP_HOST ? `Current Host: ${pc.cyan(privateConfigData.SMTP_HOST)}\n` : '') +
				(privateConfigData.SMTP_PORT ? `Current Port: ${pc.cyan(privateConfigData.SMTP_PORT?.toString())}\n` : '') +
				(privateConfigData.SMTP_EMAIL ? `Current Email: ${pc.cyan(privateConfigData.SMTP_EMAIL)}` : ''),
			pc.cyan('Existing Email Configuration:')
		);
	}

	// --- INTRODUCE CONFIGURATION MODES ---
	const configMode = await select({
		message: 'How do you want to configure email?',
		options: [
			{
				value: 'real',
				label: 'Configure with real SMTP credentials (recommended for production/reliable delivery)'
			},
			{
				value: 'dev',
				label: 'Configure for Development/Testing (uses a dummy service, no real emails sent)'
			},
			{
				value: 'skip',
				label: 'Skip email configuration for now (features requiring email will be disabled)'
			}
		],
		initialValue: privateConfigData.SMTP_HOST ? 'real' : privateConfigData.SMTP_DEV_MODE ? 'dev' : privateConfigData.SMTP_SKIPPED ? 'skip' : 'real' // Intelligent default
	});

	if (isCancel(configMode)) {
		cancelToMainMenu();
		return;
	}

	// --- HANDLE SELECTED MODE ---
	let configResult = {};

	if (configMode === 'skip') {
		note(pc.yellow('Email configuration skipped. Features requiring email will be disabled.'), pc.yellow('Skipped'));
		const confirmSkip = await confirm({
			message: 'Are you sure you want to skip email configuration?',
			initialValue: false
		});

		if (isCancel(confirmSkip) || !confirmSkip) {
			console.clear();
			return configureEmail(privateConfigData); // Retry email config
		}

		configResult = { SMTP_SKIPPED: true };
	} else if (configMode === 'dev') {
		note(
			pc.yellow('Configuring for Development/Testing.\n') +
				`This mode uses a dummy email service. Emails will NOT be sent externally.\n` +
				`They might be logged to the console or directed to a local testing tool.\n` +
				`No real SMTP credentials or connection test is required.`,
			pc.yellow('Development Mode Selected')
		);

		// --- ADD WARNING NOTE FOR DEV MODE ---
		note(
			pc.red(
				`This mode is suitable primarily for development or testing with a\n` +
					`single admin user setup.\n\n` +
					`Features relying on external email delivery (like user registration\n` +
					`verification or password reset links sent to real users) will NOT\n` +
					`function as expected. Your CMS application code must be configured to\n` +
					`handle this development environment (e.g., auto-verifying new users,\n` +
					`displaying password reset tokens instead of emailing them).`
			),
			pc.red('Important Note for Dev Mode:')
		);

		const SMTP_EMAIL = await text({
			message: 'Enter a sender email address for the dummy service:',
			placeholder: 'dev@localhost.com',
			initialValue: privateConfigData.SMTP_EMAIL || 'dev@localhost.com',
			validate: validateEmail
		});
		if (isCancel(SMTP_EMAIL)) {
			cancelToMainMenu();
			return configurationPrompt();
		}

		configResult = {
			SMTP_DEV_MODE: true,
			SMTP_EMAIL: SMTP_EMAIL,
			SMTP_HOST: 'dummy.email.service',
			SMTP_PORT: '25',
			SMTP_PASSWORD: 'dummy_password'
		};
		note(pc.green('Development email configuration saved.'), pc.green('Success'));
	} else if (configMode === 'real') {
		note(pc.blue('Proceeding with real SMTP configuration.'), pc.blue('Real SMTP Mode Selected'));

		// --- NOTE DEDICATED SERVICES ---
		note(
			pc.cyan(
				`For reliable email delivery in production, including user management\n` +
					`and potential mass mail, a dedicated transactional email service is highly recommended.\n` +
					`Examples: SendGrid, Mailgun, Postmark, Amazon SES, Brevo, etc.\n` +
					`Select "Custom Provider" to enter credentials from your chosen service\n` +
					`or any other custom SMTP server.`
			),
			pc.blue('Tip for Production/Reliable Delivery:')
		);

		// --- REAL SMTP CONFIGURATION PROMPTS ---
		const SMTP_PROVIDER = await select({
			message: 'Select your SMTP provider or choose Custom for custom settings:',
			placeholder: 'Gmail',
			initialValue: privateConfigData.SMTP_PROVIDER || 'Gmail',
			options: emailProviders.map((provider) => ({
				value: provider,
				label: provider.name
			}))
		});

		if (isCancel(SMTP_PROVIDER)) {
			cancelToMainMenu();
			return configurationPrompt();
		}

		let SMTP_HOST = SMTP_PROVIDER.host;
		let SMTP_PORT = SMTP_PROVIDER.port?.toString() || '';

		if (SMTP_PROVIDER.name === 'Custom Provider') {
			note(pc.yellow('Enter details for your Custom or Transactional Email Provider.'), pc.yellow('Custom Provider Selected'));

			SMTP_HOST = await text({
				message: 'Enter the SMTP host:',
				placeholder: 'smtp.provider.com',
				initialValue: privateConfigData.SMTP_HOST || SMTP_HOST,
				validate(value) {
					if (!value || value.length === 0) return `SMTP host is required!`;
					return undefined;
				}
			});

			if (isCancel(SMTP_HOST)) {
				cancelToMainMenu();
				return configurationPrompt();
			}

			SMTP_PORT = await text({
				message: 'Enter the SMTP port:',
				placeholder: '587',
				initialValue: privateConfigData.SMTP_PORT?.toString() || SMTP_PORT,
				validate(value) {
					const num = Number(value);
					if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 65535) {
						return `Please enter a valid port number between 1 and 65535.`;
					}
					return undefined;
				}
			});

			if (isCancel(SMTP_PORT)) {
				cancelToMainMenu();
				return configurationPrompt();
			}
		} else {
			SMTP_HOST = privateConfigData.SMTP_HOST || SMTP_PROVIDER.host;
			SMTP_PORT = privateConfigData.SMTP_PORT?.toString() || SMTP_PROVIDER.port?.toString();

			SMTP_HOST = await text({
				message: `Confirm or change the SMTP host for ${SMTP_PROVIDER.name}:`,
				placeholder: SMTP_PROVIDER.host,
				initialValue: SMTP_HOST,
				validate(value) {
					if (!value || value.length === 0) return `SMTP host is required!`;
					return undefined;
				}
			});
			if (isCancel(SMTP_HOST)) {
				cancelToMainMenu();
				return configurationPrompt();
			}

			SMTP_PORT = await text({
				message: `Confirm or change the SMTP port for ${SMTP_PROVIDER.name}:`,
				placeholder: SMTP_PROVIDER.port?.toString(),
				initialValue: SMTP_PORT,
				validate(value) {
					const num = Number(value);
					if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 65535) {
						return `Please enter a valid port number between 1 and 65535.`;
					}
					return undefined;
				}
			});
			if (isCancel(SMTP_PORT)) {
				cancelToMainMenu();
				return configurationPrompt();
			}
		}

		const SMTP_EMAIL = await text({
			message: 'Enter the email address for sending system emails:',
			placeholder: `e.g., noreply@yourcmsdomain.com`,
			initialValue: privateConfigData.SMTP_EMAIL || '',
			validate: validateEmail
		});
		if (isCancel(SMTP_EMAIL)) {
			cancelToMainMenu();
			return;
		}

		const SMTP_PASSWORD = await password({
			message: 'Enter the email account password (or API key):',
			validate(value) {
				if (!value) return `Password or API key is required.`;
				return undefined;
			}
		});
		if (isCancel(SMTP_PASSWORD)) {
			cancelToMainMenu();
			return;
		}

		// Test SMTP Connection
		const s = spinner();
		let connectionTestResult;
		try {
			s.start('Testing SMTP connection...', { indicator: 'line' });
			connectionTestResult = await testSmtpConnection({
				host: SMTP_HOST,
				port: SMTP_PORT,
				user: SMTP_EMAIL,
				pass: SMTP_PASSWORD
			});
			if (connectionTestResult === true) {
				s.stop(pc.green('SMTP connection successful!'));
			} else {
				s.stop(pc.red('SMTP connection failed.'));
				note(
					`${connectionTestResult}\n\nPlease double-check your host, port, email/username, and password/API key.\nFor transactional services, this is often an API key, not your login password.`,
					pc.red('Connection Error')
				);

				const retry = await confirm({
					message: 'Do you want to re-enter the email details?',
					initialValue: true
				});
				if (isCancel(retry) || !retry) {
					cancelToMainMenu();
					return;
				} else {
					const currentEnteredData = {
						...privateConfigData,
						SMTP_HOST: SMTP_HOST,
						SMTP_PORT: SMTP_PORT,
						SMTP_EMAIL: SMTP_EMAIL,
						SMTP_PASSWORD: SMTP_PASSWORD,
						SMTP_PROVIDER: SMTP_PROVIDER
					};
					console.clear();
					return configureEmail(currentEnteredData);
				}
			}
		} catch (error) {
			s.stop(pc.red('An unexpected error occurred during the SMTP test.'));
			note(`${error.message}\n\nPlease try again or check server logs.`, pc.red('Unexpected Error'));
			cancelToMainMenu();
			return;
		}

		// If connection successful
		if (connectionTestResult === true) {
			note(
				`SMTP Host: ${pc.green(SMTP_HOST)}\n` +
					`SMTP Port: ${pc.green(SMTP_PORT)}\n` +
					`SMTP Email: ${pc.green(SMTP_EMAIL)}\n` +
					`SMTP Password: ${pc.green('[hidden]')}`,
				pc.green('Review Your Email Configuration:')
			);

			const confirmSave = await confirm({
				message: 'Save this email configuration?',
				initialValue: true
			});

			if (isCancel(confirmSave)) {
				cancelToMainMenu();
				return;
			}

			if (!confirmSave) {
				note('Configuration not saved.', pc.yellow('Action Cancelled'));
				cancelToMainMenu();
				return;
			}

			configResult = {
				SMTP_HOST,
				SMTP_PORT,
				SMTP_EMAIL,
				SMTP_PASSWORD,
				SMTP_PROVIDER: SMTP_PROVIDER.name
			};
		} else {
			note('Email configuration not saved due to connection failure or cancellation.', pc.yellow('Configuration Failed'));
			cancelToMainMenu();
			return;
		}
	}

	return configResult;
}
