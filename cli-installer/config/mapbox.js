/** 
@file cli-installer/config/mapbox.js
@description Configuration prompts for the Mapbox section

### Features
- Displays a note about the Mapbox configuration
- Displays existing configuration (token hidden)
- Prompts for Mapbox integration
*/

import { confirm, note, isCancel, password } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

export async function configureMapbox(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the Mapbox configuration
	note(
		`The Mapbox configuration allows you to integrate Mapbox services,\n` + `enabling map features within your application.`,
		pc.green('Mapbox Configuration:')
	);

	// Display existing configuration (token hidden)
	if (privateConfigData.MAPBOX_API_TOKEN !== undefined) {
		// Check if key exists, even if false
		note(
			`Mapbox Enabled: ${pc.cyan(privateConfigData.USE_MAPBOX ? 'Yes' : 'No')}`,
			//`MAPBOX_API_TOKEN: ${pc.red(privateConfigData.MAPBOX_API_TOKEN)}`, // Keep token hidden
			pc.cyan('Existing Mapbox Configuration (Token hidden):')
		);
	}

	const USE_MAPBOX = await confirm({
		message: 'Enable Mapbox integration?',
		initialValue: privateConfigData.USE_MAPBOX || false
	});
	if (isCancel(USE_MAPBOX)) {
		cancelToMainMenu();
		return;
	}

	let MAPBOX_API_TOKEN = privateConfigData.MAPBOX_API_TOKEN || ''; // Keep existing if not re-entered

	if (USE_MAPBOX) {
		MAPBOX_API_TOKEN = await password({
			message: 'Enter your Mapbox API Token:',
			validate(value) {
				if (!value) return { message: `Mapbox API Token is required when Mapbox is enabled.` };
				return undefined;
			}
		});
		if (isCancel(MAPBOX_API_TOKEN)) {
			cancelToMainMenu();
			return;
		}
	} else {
		MAPBOX_API_TOKEN = ''; // Clear token if disabled
	}

	// Summary (Token hidden)
	note(
		`Enable Mapbox: ${pc.green(USE_MAPBOX ? 'Yes' : 'No')}\n` + (USE_MAPBOX ? `Mapbox API Token: ${pc.green('[Set]')}\n` : ''),
		pc.green('Review Your Mapbox Configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this Mapbox configuration?',
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
		USE_MAPBOX,
		MAPBOX_API_TOKEN: USE_MAPBOX ? MAPBOX_API_TOKEN : undefined
	};
}
