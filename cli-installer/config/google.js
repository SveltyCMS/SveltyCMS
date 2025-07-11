/** 
@file cli-installer/config/google.js
@description Configuration prompts for the Google section

### Features
- Displays a note about the Google configuration
- Displays existing configuration (password hidden)
- Prompts for Google integration
*/

import { confirm, isCancel, note, password, text } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

export async function configureGoogle(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the Google configuration
	note(
		`Configure Google services integration:
  • Google OAuth for user authentication
  • Google API access for enhanced features
  • Optional - can be configured later if needed`,
		pc.green('Google API Configuration:')
	);

	// Display existing configuration (excluding secret)
	if (privateConfigData.GOOGLE_CLIENT_ID || privateConfigData.GOOGLE_API_KEY) {
		note(
			`Current API Key: ${pc.cyan(privateConfigData.GOOGLE_API_KEY || 'Not Set')}\n` +
				`Use Google OAuth: ${pc.cyan(privateConfigData.USE_GOOGLE_OAUTH ? 'Yes' : 'No')}\n` +
				`Current Client ID: ${pc.cyan(privateConfigData.GOOGLE_CLIENT_ID || 'Not Set')}`,
			//`GOOGLE_CLIENT_SECRET: ${pc.red(privateConfigData.GOOGLE_CLIENT_SECRET)}`, // Keep secret hidden
			pc.cyan('Existing Google Configuration (Secret hidden):')
		);
	}

	// Collect Google API Key
	const GOOGLE_API_KEY = await text({
		message: 'Enter the Google API key (leave blank if not required):',
		placeholder: 'Google API key from Google Developer Console',
		initialValue: privateConfigData.GOOGLE_API_KEY || ''
	});

	if (isCancel(GOOGLE_API_KEY)) {
		cancelToMainMenu();
		return;
	}

	const USE_GOOGLE_OAUTH = await confirm({
		message: 'Enable Google OAuth for login?',
		initialValue: privateConfigData.USE_GOOGLE_OAUTH || false
	});
	if (isCancel(USE_GOOGLE_OAUTH)) {
		cancelToMainMenu();
		return;
	}

	let GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET;

	if (USE_GOOGLE_OAUTH) {
		GOOGLE_CLIENT_ID = await text({
			message: 'Enter the Google Client ID:',
			placeholder: 'Client ID from Google Developer Console',
			initialValue: privateConfigData.GOOGLE_CLIENT_ID || '',
			validate(value) {
				if (!value || value.length === 0) return { message: `GOOGLE_CLIENT_ID is required!` };
				return undefined;
			}
		});
		if (isCancel(GOOGLE_CLIENT_ID)) {
			cancelToMainMenu();
			return;
		}

		GOOGLE_CLIENT_SECRET = await password({
			message: 'Enter the Google Client Secret:',
			validate(value) {
				if (!value) return { message: `Google Client Secret is required when OAuth is enabled.` };
				return undefined;
			}
		});
		if (isCancel(GOOGLE_CLIENT_SECRET)) {
			cancelToMainMenu();
			return;
		}
	}

	// Summary (Secret hidden)
	note(
		`Google API Key: ${pc.green(GOOGLE_API_KEY || 'Not Set')}\n` +
			`Use Google OAuth: ${pc.green(USE_GOOGLE_OAUTH ? 'Yes' : 'No')}\n` +
			`Google Client ID: ${pc.green(GOOGLE_CLIENT_ID || 'Not Set')}\n` +
			`Google Client Secret: ${pc.green(USE_GOOGLE_OAUTH && GOOGLE_CLIENT_SECRET ? '[Set]' : 'Not Set / Not Applicable')}`,
		pc.green('Review Your Google Configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this Google configuration?',
		initialValue: true
	});

	if (isCancel(confirmSave)) {
		cancelToMainMenu();
		return;
	}

	if (!confirmSave) {
		note('Configuration not saved.', pc.yellow('Action Cancelled'));
		cancelToMainMenu(); // Return to main config menu
		return;
	}

	// Compile and return the configuration data
	return {
		GOOGLE_API_KEY,
		USE_GOOGLE_OAUTH,
		GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET
	};
}
