import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const languageOptions = [
	{ name: 'English', value: 'en' },
	{ name: 'Danish', value: 'da' },
	{ name: 'German', value: 'de' },
	{ name: 'Spanish', value: 'es' },
	{ name: 'Finnish', value: 'fi' },
	{ name: 'French', value: 'fr' },
	{ name: 'Hindi', value: 'hi' },
	{ name: 'Italian', value: 'it' },
	{ name: 'Japanese', value: 'ja' },
	{ name: 'Kannada', value: 'ka' },
	{ name: 'Nepali', value: 'ne' },
	{ name: 'Dutch', value: 'nl' },
	{ name: 'Norwegian', value: 'no' },
	{ name: 'Polish', value: 'pl' },
	{ name: 'Portuguese', value: 'pt' },
	{ name: 'Slovenian', value: 'sl' },
	{ name: 'Serbian', value: 'sr' },
	{ name: 'Swedish', value: 'sv' },
	{ name: 'Turkish', value: 'tr' },
	{ name: 'Urdu', value: 'ur' },
	{ name: 'Chinese', value: 'zh' }
];

const languageQuestions = [
	{
		type: 'list',
		name: 'DEFAULT_CONTENT_LANGUAGE',
		message: 'Choose the default content language:',
		choices: languageOptions.map((option) => ({
			name: option.name,
			value: option.value
		})),
		default: 'en'
	},
	{
		type: 'checkbox',
		name: 'AVAILABLE_CONTENT_LANGUAGES',
		message: 'Select the available content languages:',
		choices: languageOptions.map((option) => ({
			name: option.name,
			value: option.value
		})),
		default: ['en', 'de']
	},
	{
		type: 'list',
		name: 'DEFAULT_SYSTEM_LANGUAGE',
		message: 'Choose the default system language:',
		choices: languageOptions.map((option) => ({
			name: option.name,
			value: option.value
		})),
		default: 'en'
	},
	{
		type: 'checkbox',
		name: 'AVAILABLE_SYSTEM_LANGUAGES',
		message: 'Select the available system languages:',
		choices: languageOptions.map((option) => ({
			name: option.name,
			value: option.value
		})),
		default: ['en', 'de']
	}
];

export async function promptLanguageSetup() {
	const answers = await inquirer.prompt(languageQuestions);
	const action = await confirmAction('Review your language configuration:');

	if (action === 'cancel') {
		console.log('Language configuration canceled.');
		return null;
	}

	return answers;
}
