import { Title } from '../cli-installer.js';
import { isCancel, text, select, confirm, note } from '@clack/prompts';
import pc from 'picocolors';

const emailProviders = [
	{ name: 'Custom Provider', host: '', port: '' },
	{ name: 'Gmail', host: 'smtp.gmail.com', port: 587 },
	{ name: 'GMX', host: 'smtp.gmx.com', port: 587 },
	{ name: 'iCloud', host: 'smtp.mail.me.com', port: 587 },
	{ name: 'Outlook', host: 'smtp.office365.com', port: 587 },
	{ name: 'T-Online', host: 'smtp.t-online.de', port: 587 },
	{ name: 'Web.de', host: 'smtp.web.de', port: 587 },
	{ name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587 },
	{ name: 'Zoho', host: 'smtp.zoho.com', port: 587 }
];

export async function configureEmail(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	const SMTP_PROVIDER = await select({
		message: 'Select your SMTP provider or choose Custom for custom settings:',
		placeholder: 'Gmail',
		initialValue: privateConfigData.SMTP_PROVIDER || 'Gmail',
		options: emailProviders.map((provider) => ({
			value: provider,
			label: provider.name
		}))
	});

	let SMTP_HOST = SMTP_PROVIDER.host;
	let SMTP_PORT = SMTP_PROVIDER.port.toString();

	if (SMTP_PROVIDER.name === 'Custom') {
		SMTP_HOST = await text({
			message: 'Enter the SMTP host:',
			placeholder: 'smtp.provider.com',
			initialValue: privateConfigData.SMTP_HOST || SMTP_HOST
		});

		SMTP_PORT = await text({
			message: 'Enter the SMTP port:',
			placeholder: '587',
			initialValue: privateConfigData.SMTP_PORT || SMTP_PORT
			// validate: (value) => {
			// 	const port = parseInt(value, 10);
			// 	return (!isNaN(port) && port > 0 && port < 65536) || 'Please enter a valid port number between 1 and 65535.';
			// }
		});
	}

	const SMTP_EMAIL = await text({
		message: 'Enter your email address:',
		placeholder: `sveltycms@${SMTP_PROVIDER.name.toLowerCase()}.com`,
		initialValue: privateConfigData.SMTP_EMAIL || `sveltycms@${SMTP_PROVIDER.name.toLowerCase()}.com`,
		validate(value) {
			if (value.length === 0) return `Email address is required!`;
		}
	});

	const SMTP_PASSWORD = await text({
		message: 'Enter your email password:',
		placeholder: 'Enter your email password',
		// secret: true,
		initialValue: privateConfigData.SMTP_PASSWORD || '',
		validate(value) {
			if (value.length === 0) return `Password is required!`;
		}
	});

	// SveltyCMS Title
	Title();

	// Summary
	note(
		`SMTP_HOST: ${SMTP_HOST}\n` + `SMTP_PORT: ${SMTP_PORT}\n` + `SMTP_EMAIL: ${SMTP_EMAIL}\n` + `SMTP_PASSWORD: ${SMTP_PASSWORD}`,
		pc.green('Review your Email configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initial: true
	});

	if (isCancel(action)) {
		console.log('Email configuration canceled.');
		process.exit(0); // Exit with code 0
	}

	if (!action) {
		console.log('Email configuration canceled.');
		const restartOrExit = await select({
			message: 'Do you want to restart or exit?',
			options: [
				{ value: 'restart', label: 'Restart', hint: 'Start again' },
				{ value: 'cancel', label: 'Cancel', hint: 'Clear and return to selection' },
				{ value: 'exit', label: 'Exit', hint: 'Quit the installer' }
			]
		});

		if (restartOrExit === 'restart') {
			return configureEmail();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	return {
		SMTP_HOST,
		SMTP_PORT,
		SMTP_EMAIL,
		SMTP_PASSWORD
	};
}
