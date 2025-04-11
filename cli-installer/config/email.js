/** 
@file  cli-installer/config/email.js
@description Configuration prompts for the Email section

### Features
- Displays a note about the Email configuration
- Displays existing configuration (password hidden)
- Prompts for Email integration
*/

import { Title, cancelOperation } from '../cli-installer.js';
import { isCancel, text, select, confirm, note, cancel, password, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { configurationPrompt } from '../configuration.js';
import nodemailer from 'nodemailer';

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

// Helper function to validate email format (using new error return)
const validateEmail = (value) => {
	if (!value) return { message: 'Email address is required.' };
	// Basic email format check
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(value)) {
		return { message: 'Please enter a valid email address.' };
	}
	return undefined; // Valid
};

// Helper function to test SMTP connection
async function testSmtpConnection({ host, port, user, pass }) {
	const transporter = nodemailer.createTransport({
		host: host,
		port: parseInt(port, 10),
		secure: parseInt(port, 10) === 465, // true for 465, false for other ports
		auth: {
			user: user,
			pass: pass
		},
		tls: {
			// Do not fail on invalid certs if using non-standard ports or local servers
			rejectUnauthorized: process.env.NODE_ENV === 'production' && parseInt(port, 10) !== 465 && parseInt(port, 10) !== 587 ? true : false
		}
	});

	try {
		await transporter.verify();
		return true;
	} catch (error) {
		console.error('SMTP connection error details:', error);
		throw new Error(`SMTP connection failed: ${error.message}`);
	}
}

export async function configureEmail(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the SMTP configuration
	note(
		`The SMTP configuration is used to send emails from the system,\n` + `such as notifications and password resets.`,
		pc.green('Email Configuration:')
	);

	// Display existing configuration (excluding password)
	if (privateConfigData.SMTP_HOST) {
		note(
			`Current Host: ${pc.cyan(privateConfigData.SMTP_HOST)}\n` +
				`Current Port: ${pc.cyan(privateConfigData.SMTP_PORT?.toString())}\n` +
				`Current Email: ${pc.cyan(privateConfigData.SMTP_EMAIL)}`,
			pc.cyan('Existing Email Configuration (Password hidden):')
		);
	}

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
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let SMTP_HOST = SMTP_PROVIDER.host;
	let SMTP_PORT = SMTP_PROVIDER.port?.toString() || '';

	if (SMTP_PROVIDER.name === 'Custom Provider') {
		SMTP_HOST = await text({
			message: 'Enter the SMTP host:',
			placeholder: 'smtp.provider.com',
			initialValue: privateConfigData.SMTP_HOST || SMTP_HOST,
			validate(value) {
				if (!value || value.length === 0) return { message: `SMTP host is required!` };
				return undefined;
			}
		});

		if (isCancel(SMTP_HOST)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		SMTP_PORT = await text({
			message: 'Enter the SMTP port:',
			placeholder: '587',
			initialValue: privateConfigData.SMTP_PORT?.toString() || SMTP_PORT,
			validate(value) {
				const num = Number(value);
				if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 65535) {
					return { message: `Please enter a valid port number between 1 and 65535.` };
				}
				return undefined;
			}
		});

		if (isCancel(SMTP_PORT)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}
	}

	const SMTP_EMAIL = await text({
		message: 'Enter the email address for sending system emails:',
		placeholder: `sveltycms@${SMTP_PROVIDER.name.toLowerCase()}.com`,
		initialValue: privateConfigData.SMTP_EMAIL || '',
		validate: validateEmail // Use the validation function
	});
	if (isCancel(SMTP_EMAIL)) {
		await cancelOperation();
		return;
	}

	const SMTP_PASSWORD = await password({
		message: 'Enter the email account password:',
		validate(value) {
			if (!value) return { message: `Password is required.` };
			return undefined;
		}
	});
	if (isCancel(SMTP_PASSWORD)) {
		await cancelOperation();
		return;
	}

	// Test SMTP Connection
	let connectionSuccessful = false;
	const s = spinner();
	try {
		s.start('Testing SMTP connection...', { indicator: 'line' }); // Ensure indicator is set
		connectionSuccessful = await testSmtpConnection({
			host: SMTP_HOST,
			port: SMTP_PORT,
			user: SMTP_EMAIL,
			pass: SMTP_PASSWORD
		});
		s.stop(pc.green('SMTP connection successful!'));
	} catch (error) {
		s.stop(pc.red('SMTP connection failed.'));
		note(
			`${error.message}\n\nPlease double-check your host, port, email, and password. Ensure the account allows SMTP access (e.g., Gmail might require "less secure app access" or an App Password).`,
			pc.red('Connection Error')
		);

		const retry = await confirm({
			message: 'Do you want to re-enter the email details?',
			initialValue: true
		});
		if (isCancel(retry) || !retry) {
			await cancelOperation();
			return;
		} else {
			// Pass existing data back to retry
			return configureEmail(privateConfigData);
		}
	}

	if (!connectionSuccessful) {
		// This case should technically be handled by the catch block, but as a safeguard:
		note('Connection test did not succeed. Please try configuring again.', pc.yellow('Connection Test Failed'));
		await cancelOperation();
		return;
	}

	// SveltyCMS Title
	Title();

	// Summary (Password is not displayed)
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
		await cancelOperation();
		return;
	}

	if (!confirmSave) {
		note('Configuration not saved.', pc.yellow('Action Cancelled'));
		await cancelOperation(); // Return to main config menu
		return;
	}

	return {
		SMTP_HOST,
		SMTP_PORT,
		SMTP_EMAIL,
		SMTP_PASSWORD
	};
}
