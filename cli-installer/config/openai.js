import { confirm, text, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureOpenAI() {
	// SveltyCMS Title
	Title();

	// Configuration Title
	console.log(pc.blue('◆  OpenAI Configuration:'));

	// OpenAI configuration
	const USE_OPENAI = await confirm({
		message: 'Enable OpenAI integration?',
		initialValue: false
	});

	let VITE_OPEN_AI_KEY = '';

	if (USE_OPENAI) {
		VITE_OPEN_AI_KEY = await text({
			message: 'Enter your OpenAI API Key:',
			placeholder: 'see https://beta.openai.com/account/api-keys'
		});
	}

	// Summary
	note(
		`USE_OPENAI: ${pc.green(USE_OPENAI)}\n` + (USE_OPENAI ? `VITE_OPEN_AI_KEY: ${pc.green(VITE_OPEN_AI_KEY)}\n` : ''),
		pc.green('Review your OpenAI configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

	if (!action) {
		console.log('OpenAI configuration canceled.');
		const restartOrExit = await select({
			message: 'Do you want to restart or exit?',
			options: [
				{ value: 'restart', label: 'Restart', hint: 'Start again' },
				{ value: 'cancel', label: 'Cancel', hint: 'Clear and return to selection' },
				{ value: 'exit', label: 'Exit', hint: 'Quit the installer' }
			]
		});

		if (restartOrExit === 'restart') {
			return configureOpenAI();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Compile and return the configuration data
	return {
		USE_OPENAI,
		VITE_OPEN_AI_KEY: USE_OPENAI ? VITE_OPEN_AI_KEY : undefined
	};
}
