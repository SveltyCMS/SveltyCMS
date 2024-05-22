import { confirm, text, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureTiktok() {
	// SveltyCMS Title
	Title();

	// Configuration Title
	console.log(pc.blue('◆  TikTok Configuration:'));

	// TikTok configuration
	const USE_TIKTOK = await confirm({
		message: 'Enable TikTok integration?',
		initialValue: false
	});

	let TIKTOK_TOKEN = '';

	if (USE_TIKTOK) {
		TIKTOK_TOKEN = await text({
			message: 'Enter your TikTok API Token:'
		});
	}

	// Summary
	note(`USE_TIKTOK: ${USE_TIKTOK}\n` + (USE_TIKTOK ? `TIKTOK_TOKEN: ${TIKTOK_TOKEN}\n` : ''), pc.green('Review your TikTok configuration:'));

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

	if (!action) {
		console.log('TikTok configuration canceled.');
		const restartOrExit = await select({
			message: 'Do you want to restart or exit?',
			options: [
				{ value: 'restart', label: 'Restart', hint: 'Start again' },
				{ value: 'cancel', label: 'Cancel', hint: 'Clear and return to selection' },
				{ value: 'exit', label: 'Exit', hint: 'Quit the installer' }
			]
		});

		if (restartOrExit === 'restart') {
			return configureTiktok();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Compile and return the configuration data
	return {
		USE_TIKTOK,
		TIKTOK_TOKEN: USE_TIKTOK ? TIKTOK_TOKEN : undefined
	};
}
