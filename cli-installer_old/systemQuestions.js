import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const systemQuestions = [
	{
		type: 'input',
		name: 'SITE_NAME',
		message: 'Enter the site name:',
		default: 'SveltyCMS'
	},
	{
		type: 'input',
		name: 'HOST_DEV',
		message: 'Enter the hostname for development:',
		default: 'http://localhost:5173'
	},
	{
		type: 'input',
		name: 'HOST_PROD',
		message: 'Enter the hostname for production:',
		default: 'https://yourdomain.de'
	},
	{
		type: 'number',
		name: 'PASSWORD_STRENGTH',
		message: 'Enter the password strength (default: 8):',
		default: 8,
		validate: (value) => {
			if (value < 4) {
				return 'Password strength should be at least 4.';
			}
			return true;
		}
	},
	{
		type: 'input',
		name: 'BODY_SIZE_LIMIT',
		message: 'Enter the body size limit (default: 100mb):',
		default: '100mb',
		validate: (value) => {
			const regex = /^(\d+)(mb|kb|gb|b)$/i;
			if (!regex.test(value)) {
				return 'Please enter a valid size format (e.g., 100mb, 2gb, 50kb).';
			}
			return true;
		}
	}
];

export async function promptSystemSetup() {
	const answers = await inquirer.prompt(systemQuestions);
	const action = await confirmAction('Review your System configuration:');

	if (action === 'cancel') {
		console.log('System configuration canceled.');
		return null;
	}

	return answers;
}
