import { confirm, select, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureGoogle() {
	// SveltyCMS Title
	Title();

	// Collect Google API Key
	const GOOGLE_API_KEY = await select({
		message: 'Enter the Google API key (leave blank if not required):',
		placeholder: 'Google API key from Google Developer Console'
	});

	// Determine if Google OAuth should be used
	const USE_GOOGLE_OAUTH = await confirm({
		message: 'Do you want to use Google OAuth?',
		initial: false
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
		`GOOGLE_API_KEY: ${GOOGLE_API_KEY}\n` +
			`USE_GOOGLE_OAUTH: ${USE_GOOGLE_OAUTH}\n` +
			`GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID || 'Not Applicable'}\n` +
			`GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET || 'Not Applicable'}`,
		pc.green('Review your Google configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initial: true
	});

	if (!action) {
		console.log('Google configuration canceled.');
		process.exit(0); // Exit with code 0
	}

	// Compile and return the configuration data
	return {
		GOOGLE_API_KEY,
		USE_GOOGLE_OAUTH,
		GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET
	};
}
