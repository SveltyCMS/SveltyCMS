import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const openaiQuestions = [
	{
		type: 'input',
		name: 'VITE_OPEN_AI_KEY',
		message: 'Enter the OpenAI API key (leave blank if not required):'
	}
];

export async function promptOpenAISetup() {
	const answers = await inquirer.prompt(openaiQuestions);

	const action = await confirmAction('Review your OpenAI configuration:');
	if (action === 'cancel') {
		console.log('OpenAI configuration canceled.');
		return null;
	}

	return answers;
}
