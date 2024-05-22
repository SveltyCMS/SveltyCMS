import { confirm, text, note, select, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

export async function configureTiktok(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Configuration Title
	console.log(pc.blue('◆  TikTok Configuration:'));

	// TikTok configuration
	const USE_TIKTOK = await confirm({
		message: 'Enable TikTok integration?',
		initialValue: privateConfigData.USE_TIKTOK || false
	});

	if (isCancel(USE_TIKTOK)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let TIKTOK_TOKEN = '';

	if (USE_TIKTOK) {
		TIKTOK_TOKEN = await text({
			message: 'Enter your TikTok API Token:',
			initialValue: privateConfigData.TIKTOK_TOKEN || ''
		});

		if (isCancel(TIKTOK_TOKEN)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}
	}

	// Summary
	note(
		`USE_TIKTOK: ${pc.green(USE_TIKTOK)}\n` + (USE_TIKTOK ? `TIKTOK_TOKEN: ${pc.green(TIKTOK_TOKEN)}\n` : ''),
		pc.green('Review your TikTok configuration:')
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
		console.log('TikTok configuration canceled.');
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
