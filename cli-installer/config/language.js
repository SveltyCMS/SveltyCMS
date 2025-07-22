/** 
@file cli-installer/config/language.js
@description Configuration prompts for the Language section

### Features
- Displays a note about the Language configuration
- Displays existing configuration
- Prompts for Language integration
*/

import { confirm, isCancel, multiselect, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

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
		`Configure language settings for your CMS:
  • Default content language for new posts
  • Available languages for multilingual content
  • Base locale for system interface
  • Available locales for internationalization`,
		pc.green('Language Configuration:')
	);

	// Display existing configuration
	if (configData.DEFAULT_CONTENT_LANGUAGE || configData.BASE_LOCALE) {
		note(
			`Default Content: ${pc.cyan(configData.DEFAULT_CONTENT_LANGUAGE || 'Not set')}\n` +
				`Available Content: ${pc.cyan(configData.AVAILABLE_CONTENT_LANGUAGES ? configData.AVAILABLE_CONTENT_LANGUAGES.join(', ') : 'Not set')}\n` +
				`Base Locale: ${pc.cyan(configData.BASE_LOCALE || 'Not set')}\n` +
				`Available Locales: ${pc.cyan(configData.LOCALES ? configData.LOCALES.join(', ') : 'Not set')}`,
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
		cancelToMainMenu();
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
				return {
					message: `The default content language (${DEFAULT_CONTENT_LANGUAGE}) must be included in the available languages.`
				};
			}
			return undefined;
		}
	});
	if (isCancel(AVAILABLE_CONTENT_LANGUAGES)) {
		cancelToMainMenu();
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

	const BASE_LOCALE = await select({
		message: 'Choose the base locale for the system interface. (Default is English):',
		options: options,
		required: true,
		initialValue: configData?.BASE_LOCALE || 'en'
	});
	if (isCancel(BASE_LOCALE)) {
		cancelToMainMenu();
		return;
	}

	let LOCALES = await multiselect({
		// Changed const to let
		message: 'Select the available system locales. (Default is English/German):',
		options: options,
		required: true,
		initialValues: configData?.LOCALES || ['en', 'de'],
		validate(value) {
			if (value.length === 0) return { message: 'At least one system locale must be selected.' };
			if (!value.includes(BASE_LOCALE)) {
				return {
					message: `The base locale (${BASE_LOCALE}) must be included in the available locales.`
				};
			}
			return undefined;
		}
	});
	if (isCancel(LOCALES)) {
		cancelToMainMenu();
		return;
	}

	// Re-validate after selection
	if (!LOCALES.includes(BASE_LOCALE)) {
		note(
			`The selected base locale (${BASE_LOCALE}) was not included in the available locales. It has been added automatically.`,
			pc.yellow('Validation Fix')
		);
		LOCALES.push(BASE_LOCALE);
		LOCALES = [...new Set(LOCALES)];
	}

	// Summary
	note(
		`DEFAULT_CONTENT_LANGUAGE: ${pc.green(DEFAULT_CONTENT_LANGUAGE)}\n` +
			`AVAILABLE_CONTENT_LANGUAGES: ${pc.green(AVAILABLE_CONTENT_LANGUAGES.join(', '))}\n` +
			`BASE_LOCALE: ${pc.green(BASE_LOCALE)}\n` +
			`LOCALES: ${pc.green(LOCALES.join(', '))}`,
		pc.green('Review your language configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this language configuration?',
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

	return {
		DEFAULT_CONTENT_LANGUAGE,
		AVAILABLE_CONTENT_LANGUAGES,
		BASE_LOCALE,
		LOCALES
	};
}
