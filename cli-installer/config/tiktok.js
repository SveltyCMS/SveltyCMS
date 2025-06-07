/** 
@file cli-installer/config/tiktok.js
@description Configuration prompts for the TikTok section

### Features
- Displays a note about the TikTok configuration
- Displays existing configuration (token hidden)
- Prompts for TikTok integration
*/

import { confirm, note, isCancel, password } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

export async function configureTiktok(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the TikTok configuration
	note(
		`The TikTok configuration allows you to integrate TikTok services,\n` +
			`enabling features such as sharing and embedding TikTok content\n` +
			`within your application.`,
		pc.green('TikTok Configuration:')
	);

	// Display existing configuration (token hidden)
	if (privateConfigData.TIKTOK_TOKEN !== undefined) {
		// Check if key exists
		note(
			`TikTok Enabled: ${pc.cyan(privateConfigData.USE_TIKTOK ? 'Yes' : 'No')}`,
			//`TIKTOK_TOKEN: ${pc.red(privateConfigData.TIKTOK_TOKEN)}`, // Keep token hidden
			pc.cyan('Existing TikTok Configuration (Token hidden):')
		);
	}

	const USE_TIKTOK = await confirm({
		message: 'Enable TikTok integration?',
		initialValue: privateConfigData.USE_TIKTOK || false
	});
	if (isCancel(USE_TIKTOK)) {
		cancelToMainMenu();
		return;
	}

	let TIKTOK_TOKEN = privateConfigData.TIKTOK_TOKEN || '';

	if (USE_TIKTOK) {
		TIKTOK_TOKEN = await password({
			message: 'Enter your TikTok API Token:',
			validate(value) {
				if (!value) return { message: `TikTok API Token is required when TikTok is enabled.` };
				return undefined;
			}
		});
		if (isCancel(TIKTOK_TOKEN)) {
			cancelToMainMenu();
			return;
		}
	} else {
		TIKTOK_TOKEN = ''; // Clear token if disabled
	}

	// Summary (Token hidden)
	note(
		`Enable TikTok: ${pc.green(USE_TIKTOK ? 'Yes' : 'No')}\n` + (USE_TIKTOK ? `TikTok Token: ${pc.green('[Set]')}\n` : ''),
		pc.green('Review Your TikTok Configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this TikTok configuration?',
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
	// If confirmed, proceed to return the config object

	// Compile and return the configuration data
	return {
		USE_TIKTOK,
		TIKTOK_TOKEN: USE_TIKTOK ? TIKTOK_TOKEN : undefined
	};
}
