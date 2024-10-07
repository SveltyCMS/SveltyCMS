/** 
@file cli-installer/config/openai.js
@description Configuration prompts for the OpenAI section
*/

import { confirm, text, note, select, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

export async function configureOpenAI(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the OpenAI configuration
	note(
		`The OpenAI configuration allows you to integrate OpenAI services,\n` + `such as GPT-3, for generating content and other AI-powered features.`,
		pc.green('OpenAI Configuration:')
	);

	// Display existing configuration
	note(
		`USE_OPEN_AI: ${pc.red(privateConfigData.USE_OPEN_AI ? 'true' : 'false')}\n` + `VITE_OPEN_AI_KEY: ${pc.red(privateConfigData.VITE_OPEN_AI_KEY)}`,
		pc.red('Existing OpenAI Configuration:')
	);

	// OpenAI configuration
	const USE_OPEN_AI = await confirm({
		message: 'Enable OpenAI integration?',
		placeholder: 'false / true',
		initialValue: privateConfigData.USE_OPEN_AI || false
	});

	if (isCancel(USE_OPEN_AI)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let VITE_OPEN_AI_KEY = '';

	if (USE_OPEN_AI) {
		VITE_OPEN_AI_KEY = await text({
			message: 'Enter your OpenAI API Key:',
			placeholder: 'see https://beta.openai.com/account/api-keys',
			initialValue: privateConfigData.VITE_OPEN_AI_KEY || ''
		});

		if (isCancel(VITE_OPEN_AI_KEY)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}
	}

	// Summary
	note(
		`USE_OPEN_AI: ${pc.green(USE_OPEN_AI ? 'true' : 'false')}\n` + (USE_OPEN_AI ? `VITE_OPEN_AI_KEY: ${pc.green(VITE_OPEN_AI_KEY)}\n` : ''),
		pc.green('Review your OpenAI configuration:')
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
		console.log('OpenAI configuration canceled.');
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
			return configureOpenAI();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Compile and return the configuration data
	return {
		USE_OPEN_AI,
		VITE_OPEN_AI_KEY: USE_OPEN_AI ? VITE_OPEN_AI_KEY : ''
	};
}
