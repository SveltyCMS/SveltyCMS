import { confirm, select, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureGoogle() {
	// SveltyCMS Title
	Title();

	// Configuration Title
	console.log(pc.blue('◆  Google Configuration:'));

	// Collect Google API Key
	const GOOGLE_API_KEY = await select({
		message: 'Enter the Google API key (leave blank if not required):',
		placeholder: 'Google API key from Google Developer Console'
	});

	// Determine if Google OAuth should be used
	const USE_GOOGLE_OAUTH = await confirm({
		message: 'Do you want to use Google OAuth?',
		initialValue: false
	});

	let GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET;

	if (USE_GOOGLE_OAUTH) {
		GOOGLE_CLIENT_ID = await select({
			message: 'Enter the Google Client ID:',
			placeholder: 'Client ID from Google Developer Console',
			validate(value) {
				if (value.length === 0) return `GOOGLE_CLIENT_ID is required!`;
			}
		});

		GOOGLE_CLIENT_SECRET = await select({
			message: 'Enter the Google Client Secret:',
			placeholder: 'Client Secret from Google Developer Console',
			validate(value) {
				if (value.length === 0) return `GOOGLE_CLIENT_SECRET is required!`;
			}
		});
	}

	// Summary
	note(
		`GOOGLE_API_KEY:  ${pc.green(GOOGLE_API_KEY)}\n` +
			`USE_GOOGLE_OAUTH: ${pc.green(USE_GOOGLE_OAUTH)}\n` +
			`GOOGLE_CLIENT_ID:  ${pc.green(GOOGLE_CLIENT_ID || 'Not Applicable')}\n` +
			`GOOGLE_CLIENT_SECRET:  ${pc.green(GOOGLE_CLIENT_SECRET || 'Not Applicable')}`,
		pc.green('Review your Google configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

	if (!action) {
		console.log('Google configuration canceled.');
		const restartOrExit = await select({
			message: 'Do you want to restart or exit?',
			options: [
				{ value: 'restart', label: 'Restart', hint: 'Start again' },
				{ value: 'cancel', label: 'Cancel', hint: 'Clear and return to selection' },
				{ value: 'exit', label: 'Exit', hint: 'Quit the installer' }
			]
		});

		if (restartOrExit === 'restart') {
			return configureGoogle();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Compile and return the configuration data
	return {
		GOOGLE_API_KEY,
		USE_GOOGLE_OAUTH,
		GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET
	};
}
