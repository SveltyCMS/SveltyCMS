import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const questions = [
	{
		type: 'input',
		name: 'MEDIA_FOLDER',
		message: "Enter the folder where the site's media files will be stored:",
		default: 'mediaFiles'
	},
	{
		type: 'input',
		name: 'MEDIASERVER_URL',
		message: 'Enter the URL of the media server (leave blank for localhost):',
		default: '',
		when: (answers) => !answers.CUSTOM_QUALITY
	},
	{
		type: 'list',
		name: 'MEDIA_OUTPUT_FORMAT',
		message: 'Choose the media output format:',
		choices: [
			{ name: 'Original', value: 'original' },
			{ name: 'AVIF', value: 'avif' },
			{ name: 'WEBP', value: 'webp' }
		],
		default: 'original'
	},
	{
		type: 'confirm',
		name: 'CUSTOM_QUALITY',
		message: 'Would you like to specify a custom quality for the media output?',
		default: false
	},
	{
		type: 'number',
		name: 'MEDIA_OUTPUT_QUALITY',
		message: 'Enter the media output quality (0-100):',
		default: (answers) => {
			switch (answers.MEDIA_OUTPUT_FORMAT) {
				case 'avif':
					return 40;
				case 'webp':
					return 60;
				default:
					return 100;
			}
		},
		when: (answers) => answers.CUSTOM_QUALITY,
		validate: (value) => {
			if (value >= 0 && value <= 100) return true;
			return 'Please enter a valid quality percentage between 0 and 100.';
		}
	}
];

export async function promptMediaSetup() {
	const answers = await inquirer.prompt(questions);

	if (!answers.CUSTOM_QUALITY && !('MEDIA_OUTPUT_QUALITY' in answers)) {
		answers.MEDIA_OUTPUT_QUALITY = {
			avif: 40,
			webp: 60,
			original: 100
		}[answers.MEDIA_OUTPUT_FORMAT];
	}

	const action = await confirmAction('Review your media configuration:');
	if (action === 'cancel') {
		console.log('Media configuration canceled.');
		return null;
	}

	return answers;
}
