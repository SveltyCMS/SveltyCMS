import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

export const ticktokQuestions = [
	{
		type: 'input',
		name: 'TIKTOK_TOKEN',
		message: 'Enter the TikTok token (leave blank if not required):'
	}
];

export async function promptTicktokSetup() {
	const answers = await inquirer.prompt(ticktokQuestions);

	const action = await confirmAction('Review your TikTok configuration:');
	if (action === 'cancel') {
		console.log('TikTok configuration canceled.');
		return null;
	}

	return answers;
}
