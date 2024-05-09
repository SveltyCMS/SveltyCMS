import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const googleQuestions = [
	{
		type: 'input',
		name: 'GOOGLE_API_KEY',
		message: 'Enter the Google API key (leave blank if not required):'
	},
	{
		type: 'confirm',
		name: 'USE_GOOGLE_OAUTH',
		message: 'Do you want to enable Google OAuth?',
		default: false
	},
	{
		type: 'input',
		name: 'GOOGLE_CLIENT_ID',
		message: 'Enter the Google Client ID:',
		when: (answers) => answers.USE_GOOGLE_OAUTH
	},
	{
		type: 'input',
		name: 'GOOGLE_CLIENT_SECRET',
		message: 'Enter the Google Client Secret:',
		when: (answers) => answers.USE_GOOGLE_OAUTH
	}
];

export async function promptGoogleSetup() {
	const answers = await inquirer.prompt(googleQuestions);
	const action = await confirmAction('Review your Google API configuration:');

	if (action === 'cancel') {
		console.log('Google API configuration canceled.');
		return null;
	}

	return answers;
}
