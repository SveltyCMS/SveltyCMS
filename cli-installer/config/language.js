import { confirm, multiselect, select, isCancel, cancel, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

const languageOptions = [
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
		`The Language configuration allows you to set the default and available languages for both content and system interfaces.`,
		pc.green('Language Configuration:')
	);

	const options = languageOptions.map((option) => ({
		value: option.value,
		label: `${option.label}`,
		hint: `${option.value}`
	}));

	const DEFAULT_CONTENT_LANGUAGE = await select({
		message: 'Choose the default content language. Default is English:',
		options: options,
		required: true,
		initialValue: configData?.DEFAULT_CONTENT_LANGUAGE || 'en'
	});

	if (isCancel(DEFAULT_CONTENT_LANGUAGE)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const AVAILABLE_CONTENT_LANGUAGES = await multiselect({
		message: 'Select the available content languages. Default is English/German:',
		options: options,
		required: true,
		initialValues: configData?.AVAILABLE_CONTENT_LANGUAGES || ['en', 'de']
	});

	if (isCancel(AVAILABLE_CONTENT_LANGUAGES)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const DEFAULT_SYSTEM_LANGUAGE = await select({
		message: 'Choose the default system language. Default is English:',
		options: options,
		required: true,
		initialValue: configData?.DEFAULT_SYSTEM_LANGUAGE || 'en'
	});

	if (isCancel(DEFAULT_SYSTEM_LANGUAGE)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const AVAILABLE_SYSTEM_LANGUAGES = await multiselect({
		message: 'Select the available system languages. Default is English/German:',
		options: options,
		required: true,
		initialValues: configData?.AVAILABLE_SYSTEM_LANGUAGES || ['en', 'de']
	});

	if (isCancel(AVAILABLE_SYSTEM_LANGUAGES)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
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
		console.log('Language configuration canceled.');
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
			return configureLanguage();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	return {
		DEFAULT_CONTENT_LANGUAGE,
		AVAILABLE_CONTENT_LANGUAGES,
		DEFAULT_SYSTEM_LANGUAGE,
		AVAILABLE_SYSTEM_LANGUAGES
	};
}
