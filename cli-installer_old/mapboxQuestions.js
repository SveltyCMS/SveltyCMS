import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

export const mapboxQuestions = [
	{
		type: 'confirm',
		name: 'USE_MAPBOX',
		message: 'Do you want to enable Mapbox?',
		default: false
	},
	{
		type: 'input',
		name: 'MAPBOX_API_TOKEN',
		message: 'Enter the Mapbox API token:',
		when: (answers) => answers.USE_MAPBOX // Only prompt for the token if Mapbox is enabled
	}
];

export async function promptMapboxSetup() {
	const answers = await inquirer.prompt(mapboxQuestions);
	const action = await confirmAction('Review your Mapbox configuration:');

	if (action === 'cancel') {
		console.log('Mapbox configuration canceled.');
		return null;
	}

	return answers;
}
