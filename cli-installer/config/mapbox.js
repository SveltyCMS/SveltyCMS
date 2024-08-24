// @file cli-installer/config/mapbox.js
// @description Configuration prompts for the Mapbox section

import { confirm, text, note, select, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

export async function configureMapbox(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the Mapbox configuration
	note(
		`The Mapbox configuration allows you to integrate Mapbox services,\n` + `enabling map features within your application.`,
		pc.green('Mapbox Configuration:')
	);

	// Display existing configuration
	note(
		`USE_MAPBOX: ${pc.red(privateConfigData.USE_MAPBOX ? 'true' : 'false')}\n` + `MAPBOX_API_TOKEN: ${pc.red(privateConfigData.MAPBOX_API_TOKEN)}`,
		pc.red('Existing Mapbox Configuration:')
	);

	// Mapbox configuration
	const USE_MAPBOX = await confirm({
		message: 'Enable Mapbox integration?',
		placeholder: 'false / true',
		initialValue: privateConfigData.USE_MAPBOX || false
	});

	if (isCancel(USE_MAPBOX)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let MAPBOX_API_TOKEN = '';

	if (USE_MAPBOX) {
		MAPBOX_API_TOKEN = await text({
			message: 'Enter your Mapbox API Token:',
			placeholder: 'see https://www.mapbox.com/account/access-tokens/',
			initialValue: privateConfigData.MAPBOX_API_TOKEN || ''
		});

		if (isCancel(MAPBOX_API_TOKEN)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}
	}

	// Summary
	note(
		`USE_MAPBOX: ${pc.green(USE_MAPBOX ? 'true' : 'false')}\n` + (USE_MAPBOX ? `MAPBOX_API_TOKEN: ${pc.green(MAPBOX_API_TOKEN)}\n` : ''),
		pc.green('Review your Mapbox configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

	if (isCancel(action)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	if (!action) {
		console.log('Mapbox configuration canceled.');
		const restartOrExit = await select({
			message: 'Do you want to restart or exit?',
			options: [
				{ value: 'restart', label: 'Restart', hint: 'Start again' },
				{ value: 'cancel', label: 'Cancel', hint: 'Clear and return to selection' },
				{ value: 'exit', label: 'Exit', hint: 'Quit the installer' }
			]
		});

		if (isCancel(restartOrExit)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		if (restartOrExit === 'restart') {
			return configureMapbox();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Compile and return the configuration data
	return {
		USE_MAPBOX,
		MAPBOX_API_TOKEN: USE_MAPBOX ? MAPBOX_API_TOKEN : undefined
	};
}
