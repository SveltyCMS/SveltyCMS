/**
 * @file cli-installer/config/llm.js
 * @description Configuration prompts for LLM API integrations, such as OpenAI, Claude, and Gemini.
 */

import { confirm, text, note, select, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

export async function configureLLM(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the LLM configuration
	note(
		`This configuration allows you to integrate multiple LLM (Large Language Model) services,\n` +
			`such as OpenAI, Claude, Gemini, for AI-powered features in SveltyCMS.`,
		pc.green('LLM Configuration:')
	);

	// Display existing configuration
	note(`Current LLM API configurations:\n` + `${JSON.stringify(privateConfigData.LLM_APIS, null, 2)}`, pc.red('Existing LLM Configuration:'));

	// Loop to allow adding multiple LLM configurations
	const llmConfigs = privateConfigData.LLM_APIS || {};

	let addMore;
	do {
		// Choose an LLM provider
		const providerKey = await text({
			message: 'Enter a unique identifier for this LLM provider (e.g., "chatgpt", "claude", "gemini"):',
			placeholder: 'e.g., "chatgpt"'
		});

		if (isCancel(providerKey)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		// Enable or disable this LLM provider
		const enableLLM = await confirm({
			message: `Enable ${providerKey} integration?`,
			placeholder: 'false / true',
			initialValue: !!llmConfigs[providerKey]?.enabled
		});

		if (isCancel(enableLLM)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		let apiKey = '';
		let model = '';
		let baseUrl = '';

		if (enableLLM) {
			apiKey = await text({
				message: `Enter your API key for ${providerKey}:`,
				placeholder: `API key for ${providerKey}`,
				initialValue: llmConfigs[providerKey]?.apiKey || ''
			});

			if (isCancel(apiKey)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}

			model = await text({
				message: `Enter the model name/type for ${providerKey} (optional):`,
				placeholder: 'e.g., "gpt-4"',
				initialValue: llmConfigs[providerKey]?.model || ''
			});

			if (isCancel(model)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}

			baseUrl = await text({
				message: `Enter the base URL for ${providerKey} API (optional):`,
				placeholder: 'e.g., "https://api.openai.com/v1"',
				initialValue: llmConfigs[providerKey]?.baseUrl || ''
			});

			if (isCancel(baseUrl)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}
		}

		// Update the configuration for the current provider
		llmConfigs[providerKey] = {
			enabled: enableLLM,
			apiKey: enableLLM ? apiKey : '',
			model: model || undefined,
			baseUrl: baseUrl || undefined
		};

		// Summary for the current provider configuration
		note(
			`Provider: ${providerKey}\n` +
				`Enabled: ${pc.green(enableLLM ? 'true' : 'false')}\n` +
				(enableLLM ? `API Key: ${pc.green(apiKey)}\n` : '') +
				(model ? `Model: ${pc.green(model)}\n` : '') +
				(baseUrl ? `Base URL: ${pc.green(baseUrl)}\n` : ''),
			pc.green(`Review your configuration for ${providerKey}:`)
		);

		addMore = await confirm({
			message: 'Would you like to add another LLM provider?',
			initialValue: false
		});

		if (isCancel(addMore)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}
	} while (addMore);

	// Confirm overall configuration
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
		console.log('LLM configuration canceled.');
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
			return configureLLM();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Return the compiled LLM API configurations
	return { LLM_APIS: llmConfigs };
}
