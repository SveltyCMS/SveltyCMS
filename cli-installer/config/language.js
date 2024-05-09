import { confirm, multiselect, isCancel, select, cancel, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

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
	{ value: 'ur', label: 'Urdu' },
	{ value: 'zh', label: 'Chinese' }
];

languageOptions.sort((a, b) => a.label.localeCompare(b.label));

export async function configureLanguage() {
	// SveltyCMS Title
	Title();

	const options = languageOptions.map((option) => ({
		value: option.value,
		label: `${option.label}`,
		hint: `${option.label} (${option.value})`
	}));

	const answers = {
		DEFAULT_CONTENT_LANGUAGE: await select({
			message: 'Choose the default content language. Default is English:',
			maxItems: 5,
			options: options,
			required: true,
			cursorAt: ['en'],
			initialValues: ['en']
		}),

		AVAILABLE_CONTENT_LANGUAGES: await multiselect({
			message: 'Select the available content languages. Default is English/German:',
			maxItems: 5,
			options: options,
			required: true,
			cursorAt: ['en'],
			initialValues: ['en', 'de']
		}),

		DEFAULT_SYSTEM_LANGUAGE: await select({
			message: 'Choose the default system language. Default is English:',
			maxItems: 5,
			options: options,
			required: true,
			cursorAt: ['en'],
			initialValues: ['en']
		}),

		AVAILABLE_SYSTEM_LANGUAGES: await multiselect({
			message: 'Select the available system languages. Default is English/German:',
			maxitems: 5,
			options: options,
			required: true,
			cursorAt: ['en'],
			initialValues: ['en', 'de']
		})
	};
	if (isCancel(answers)) {
		cancel('Operation cancelled.');
		process.exit(0);
	}

	// SveltyCMS Title
	Title();

	// Summary
	note(
		`DEFAULT_CONTENT_LANGUAGE: ${answers.DEFAULT_CONTENT_LANGUAGE}\n` +
			`AVAILABLE_CONTENT_LANGUAGES: ${answers.AVAILABLE_CONTENT_LANGUAGES.join(', ')}\n` +
			`DEFAULT_SYSTEM_LANGUAGE: ${answers.DEFAULT_SYSTEM_LANGUAGE}\n` +
			`AVAILABLE_SYSTEM_LANGUAGES: ${answers.AVAILABLE_SYSTEM_LANGUAGES.join(', ')}`,

		pc.green('Review your language configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initial: true
	});

	if (isCancel(action)) {
		console.log('Language configuration canceled.');
		process.exit(0); // Exit with code 0
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

		if (restartOrExit === 'restart') {
			return configureLanguage();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	return answers;
}
