/** 
@file cli-installer/config/language.js
@description Configuration prompts for the Language section

### Features
- Displays a note about the Language configuration
- Displays existing configuration
- Prompts for Language integration
*/

import { confirm, multiselect, select, isCancel, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelOperation } from '../cli-installer.js';

// Languages
const languageOptions = [
	{ value: 'bn', label: 'Bengali' },
	{ value: 'da', label: 'Danish' },
	{ value: 'de', label: 'German' },
	{ value: 'en', label: 'English' },
	{ value: 'es', label: 'Spanish' },
	{ value: 'fi', label: 'Finnish' },
	{ value: 'fr', label: 'French' },
	{ value: 'hi', label: 'Hindi' },
	{ value: 'it', label: 'Italian' },
	{ value: 'ja', label: 'Japanese' },
	{ value: 'ka', label: 'Kannada' },
	{ value: 'ne', label: 'Nepali' },
	{ value: 'nl', label: 'Dutch' },
	{ value: 'no', label: 'Norwegian' },
	{ value: 'pl', label: 'Polish' },
	{ value: 'pt', label: 'Portuguese' },
	{ value: 'sl', label: 'Slovenian' },
	{ value: 'sr', label: 'Serbian' },
	{ value: 'sv', label: 'Swedish' },
	{ value: 'tr', label: 'Turkish' },
	{ value: 'uk', label: 'Ukrainian' },
	{ value: 'ur', label: 'Urdu' },
	{ value: 'zh', label: 'Chinese' }
];

languageOptions.sort((a, b) => a.label.localeCompare(b.label));

export async function configureLanguage(configData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the Language configuration
	note(
		`The Language configuration allows you to set the default\n` + `and available languages for both content and system interfaces.`,
		pc.green('Language Configuration:')
	);

	// Display existing configuration
	if (configData.DEFAULT_CONTENT_LANGUAGE || configData.DEFAULT_SYSTEM_LANGUAGE) {
		note(
			`Default Content: ${pc.cyan(configData.DEFAULT_CONTENT_LANGUAGE || 'Not set')}\n` +
				`Available Content: ${pc.cyan(configData.AVAILABLE_CONTENT_LANGUAGES ? configData.AVAILABLE_CONTENT_LANGUAGES.join(', ') : 'Not set')}\n` +
				`Default System: ${pc.cyan(configData.DEFAULT_SYSTEM_LANGUAGE || 'Not set')}\n` +
				`Available System: ${pc.cyan(configData.AVAILABLE_SYSTEM_LANGUAGES ? configData.AVAILABLE_SYSTEM_LANGUAGES.join(', ') : 'Not set')}`,
			pc.cyan('Existing Language Configuration:')
		);
	}

	const options = languageOptions.map((option) => ({
		value: option.value,
		label: `${option.label}`,
		hint: `${option.value}`
	}));

	const DEFAULT_CONTENT_LANGUAGE = await select({
		message: 'Choose the default content language. (Default is English):',
		options: options,
		required: true,
		initialValue: configData?.DEFAULT_CONTENT_LANGUAGE || 'en'
	});
	if (isCancel(DEFAULT_CONTENT_LANGUAGE)) {
		await cancelOperation();
		return;
	}

	let AVAILABLE_CONTENT_LANGUAGES = await multiselect({
		// Changed const to let
		message: 'Select the available content languages. (Default is English/German):',
		options: options,
		required: true,
		initialValues: configData?.AVAILABLE_CONTENT_LANGUAGES || ['en', 'de'],
		validate(value) {
			if (value.length === 0) return { message: 'At least one content language must be selected.' };
			if (!value.includes(DEFAULT_CONTENT_LANGUAGE)) {
				return { message: `The default content language (${DEFAULT_CONTENT_LANGUAGE}) must be included in the available languages.` };
			}
			return undefined;
		}
	});
	if (isCancel(AVAILABLE_CONTENT_LANGUAGES)) {
		await cancelOperation();
		return;
	}

	// Re-validate after selection (in case initial value was invalid)
	if (!AVAILABLE_CONTENT_LANGUAGES.includes(DEFAULT_CONTENT_LANGUAGE)) {
		note(
			`The selected default content language (${DEFAULT_CONTENT_LANGUAGE}) was not included in the available languages. It has been added automatically.`,
			pc.yellow('Validation Fix')
		);
		AVAILABLE_CONTENT_LANGUAGES.push(DEFAULT_CONTENT_LANGUAGE);
		// Ensure uniqueness if added automatically
		AVAILABLE_CONTENT_LANGUAGES = [...new Set(AVAILABLE_CONTENT_LANGUAGES)];
	}

	const DEFAULT_SYSTEM_LANGUAGE = await select({
		message: 'Choose the default system language. (Default is English):',
		options: options,
		required: true,
		initialValue: configData?.DEFAULT_SYSTEM_LANGUAGE || 'en'
	});
	if (isCancel(DEFAULT_SYSTEM_LANGUAGE)) {
		await cancelOperation();
		return;
	}

	let AVAILABLE_SYSTEM_LANGUAGES = await multiselect({
		// Changed const to let
		message: 'Select the available system languages. (Default is English/German):',
		options: options,
		required: true,
		initialValues: configData?.AVAILABLE_SYSTEM_LANGUAGES || ['en', 'de'],
		validate(value) {
			if (value.length === 0) return { message: 'At least one system language must be selected.' };
			if (!value.includes(DEFAULT_SYSTEM_LANGUAGE)) {
				return { message: `The default system language (${DEFAULT_SYSTEM_LANGUAGE}) must be included in the available languages.` };
			}
			return undefined;
		}
	});
	if (isCancel(AVAILABLE_SYSTEM_LANGUAGES)) {
		await cancelOperation();
		return;
	}

	// Re-validate after selection
	if (!AVAILABLE_SYSTEM_LANGUAGES.includes(DEFAULT_SYSTEM_LANGUAGE)) {
		note(
			`The selected default system language (${DEFAULT_SYSTEM_LANGUAGE}) was not included in the available languages. It has been added automatically.`,
			pc.yellow('Validation Fix')
		);
		AVAILABLE_SYSTEM_LANGUAGES.push(DEFAULT_SYSTEM_LANGUAGE);
		AVAILABLE_SYSTEM_LANGUAGES = [...new Set(AVAILABLE_SYSTEM_LANGUAGES)];
	}

	// SveltyCMS Title
	Title();

	// Summary
	note(
		`DEFAULT_CONTENT_LANGUAGE: ${pc.green(DEFAULT_CONTENT_LANGUAGE)}\n` +
			`AVAILABLE_CONTENT_LANGUAGES: ${pc.green(AVAILABLE_CONTENT_LANGUAGES.join(', '))}\n` +
			`DEFAULT_SYSTEM_LANGUAGE: ${pc.green(DEFAULT_SYSTEM_LANGUAGE)}\n` +
			`AVAILABLE_SYSTEM_LANGUAGES: ${pc.green(AVAILABLE_SYSTEM_LANGUAGES.join(', '))}`,
		pc.green('Review your language configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this language configuration?',
		initialValue: true
	});

	if (isCancel(confirmSave)) {
		await cancelOperation();
		return;
	}

	if (!confirmSave) {
		note('Configuration not saved.', pc.yellow('Action Cancelled'));
		await cancelOperation(); // Return to main config menu
		return;
	}

	return {
		DEFAULT_CONTENT_LANGUAGE,
		AVAILABLE_CONTENT_LANGUAGES,
		DEFAULT_SYSTEM_LANGUAGE,
		AVAILABLE_SYSTEM_LANGUAGES
	};
}
