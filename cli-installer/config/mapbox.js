import { confirm, text, note } from '@clack/prompts';
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
	note(`USE_MAPBOX: ${USE_MAPBOX}\n` + (USE_MAPBOX ? `MAPBOX_API_TOKEN: ${MAPBOX_API_TOKEN}\n` : ''), pc.green('Review your Mapbox configuration:'));

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initial: true
	});

	if (!action) {
		console.log('Mapbox configuration canceled.');
		process.exit(0); // Exit with code 0
	}

	// Compile and return the configuration data
	return {
		USE_MAPBOX,
		MAPBOX_API_TOKEN: USE_MAPBOX ? MAPBOX_API_TOKEN : undefined
	};
}
