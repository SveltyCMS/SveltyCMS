/**
 * @file cli-installer/config/llm.js
 * @description Configuration prompts for LLM API integrations, such as OpenAI, Claude, and Gemini.
 *
 * ### Features
 * - Displays a note about the LLM configuration
 * - Displays existing configuration (password hidden)
 * - Prompts for LLM integration
 */

import { confirm, text, note, isCancel, password } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

export async function configureLLM(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the LLM configuration
	note(
		`This configuration allows you to integrate multiple LLM (Large Language Model) services,\n` +
			`such as OpenAI, Claude, Gemini, for AI-powered features in SveltyCMS.`,
		pc.green('LLM Configuration:')
	);

	// Display existing configuration keys (secrets hidden)
	const existingKeys = privateConfigData.LLM_APIS ? Object.keys(privateConfigData.LLM_APIS) : [];
	if (existingKeys.length > 0) {
		note(`Configured Providers: ${pc.cyan(existingKeys.join(', '))}`, pc.cyan('Existing LLM Configuration (Details hidden):'));
	} else {
		note('No LLM providers configured yet.', pc.cyan('Existing LLM Configuration:'));
	}

	// Loop to allow adding multiple LLM configurations
	const llmConfigs = { ...(privateConfigData.LLM_APIS || {}) }; // Clone to avoid modifying original if cancelled

	let addMore;
	do {
		// Choose an LLM provider
		const providerKey = await text({
			message: 'Enter a unique identifier for this LLM provider (e.g., "openai", "claude", "gemini"):',
			placeholder: 'e.g., "openai"',
			validate(value) {
				if (!value) return { message: 'Provider identifier cannot be empty.' };
				// Optional: Check if key already exists and prompt for overwrite confirmation? For simplicity, allow overwrite for now.
				return undefined;
			}
		});
		if (isCancel(providerKey)) {
			cancelToMainMenu();
			return;
		}

		const enableLLM = await confirm({
			message: `Enable this '${providerKey}' integration?`,
			initialValue: llmConfigs[providerKey]?.enabled ?? true // Default to true if new or existing enabled
		});
		if (isCancel(enableLLM)) {
			cancelToMainMenu();
			return;
		}

		let apiKey = llmConfigs[providerKey]?.apiKey || ''; // Keep existing if not re-entered
		let model = llmConfigs[providerKey]?.model || '';
		let baseUrl = llmConfigs[providerKey]?.baseUrl || '';

		if (enableLLM) {
			apiKey = await password({
				message: `Enter API key for '${providerKey}':`,
				validate(value) {
					if (!value) return { message: `API Key is required for enabled providers.` };
					return undefined;
				}
			});
			if (isCancel(apiKey)) {
				cancelToMainMenu();
				return;
			}

			model = await text({
				message: `Enter model name for '${providerKey}' (optional):`,
				placeholder: 'e.g., gpt-4o',
				initialValue: model
			});
			if (isCancel(model)) {
				cancelToMainMenu();
				return;
			}

			baseUrl = await text({
				message: `Enter API base URL for '${providerKey}' (optional, leave blank for default):`,
				placeholder: 'e.g., https://api.openai.com/v1',
				initialValue: baseUrl
			});
			if (isCancel(baseUrl)) {
				cancelToMainMenu();
				return;
			}
		} else {
			// Clear sensitive info if disabled
			apiKey = '';
			model = '';
			baseUrl = '';
		}

		// Update the configuration for the current provider
		llmConfigs[providerKey] = {
			enabled: enableLLM,
			apiKey: enableLLM ? apiKey : '',
			model: model || undefined,
			baseUrl: baseUrl || undefined
		};

		// Summary for the current provider configuration (API key hidden)
		note(
			`Provider: ${pc.cyan(providerKey)}\n` +
				`Enabled: ${pc.green(enableLLM ? 'Yes' : 'No')}\n` +
				(enableLLM ? `API Key: ${pc.green('[Set]')}\n` : '') +
				(model ? `Model: ${pc.green(model)}\n` : '') +
				(baseUrl ? `Base URL: ${pc.green(baseUrl)}\n` : ''),
			pc.green(`Review Configuration for '${providerKey}':`)
		);

		addMore = await confirm({
			message: 'Would you like to add another LLM provider?',
			initialValue: false
		});

		if (isCancel(addMore)) {
			cancelToMainMenu();
			return;
		}
	} while (addMore);

	// Confirm overall configuration
	note(
		`Final LLM Configuration:\n${JSON.stringify(llmConfigs, (key, value) => (key === 'apiKey' ? '[Set]' : value), 2)}`,
		pc.green('Final LLM Configuration Review (API Keys hidden):')
	);

	const confirmSave = await confirm({
		message: 'Save this LLM configuration?',
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

	// Return the compiled LLM API configurations
	return { LLM_APIS: llmConfigs };
}
