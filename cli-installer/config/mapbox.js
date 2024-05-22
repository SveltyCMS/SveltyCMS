import { confirm, text, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureMapbox() {
	// SveltyCMS Title
	Title();

	// Mapbox configuration
	const USE_MAPBOX = await confirm({
		message: 'Enable Mapbox integration?',
		initialValue: false
	});

	let MAPBOX_API_TOKEN = '';

	if (USE_MAPBOX) {
		MAPBOX_API_TOKEN = await text({
			message: 'Enter your Mapbox API Token:',
			placeholder: 'see https://www.mapbox.com/account/access-tokens/'
		});
	}

	// Summary
	note(
		`USE_MAPBOX: ${pc.green(USE_MAPBOX)}\n` + (USE_MAPBOX ? `MAPBOX_API_TOKEN: ${pc.green(MAPBOX_API_TOKEN)}\n` : ''),
		pc.green('Review your Mapbox configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

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
