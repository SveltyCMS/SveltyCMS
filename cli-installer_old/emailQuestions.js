import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const emailProviders = [
	{ name: 'Custom', host: '', port: '' },
	{ name: 'Gmail', host: 'smtp.gmail.com', port: 587 },
	{ name: 'GMX', host: 'smtp.gmx.com', port: 587 },
	{ name: 'iCloud', host: 'smtp.mail.me.com', port: 587 },
	{ name: 'Outlook', host: 'smtp.office365.com', port: 587 },
	{ name: 'T-Online', host: 'smtp.t-online.de', port: 587 },
	{ name: 'Web.de', host: 'smtp.web.de', port: 587 },
	{ name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587 },
	{ name: 'Zoho', host: 'smtp.zoho.com', port: 587 }
];

const emailQuestions = [
	{
		type: 'list',
		name: 'SMTP_PROVIDER',
		message: 'Select your SMTP provider or choose Custom for custom settings:',
		choices: emailProviders.map((provider) => ({
			name: provider.name,
			value: provider
		}))
	},
	{
		type: 'input',
		name: 'SMTP_HOST',
		message: 'Enter the SMTP host:',
		default: (answers) => answers.SMTP_PROVIDER.host,
		when: (answers) => answers.SMTP_PROVIDER.name === 'Custom'
	},
	{
		type: 'input',
		name: 'SMTP_PORT',
		message: 'Enter the SMTP port:',
		default: (answers) => answers.SMTP_PROVIDER.port.toString(),
		validate: (value) => /^\d+$/.test(value) || 'Please enter a valid port number.',
		when: (answers) => answers.SMTP_PROVIDER.name === 'Custom'
	},
	{
		type: 'input',
		name: 'SMTP_EMAIL',
		message: 'Enter your email address:'
	},
	{
		type: 'password',
		name: 'SMTP_PASSWORD',
		message: 'Enter your email password:',
		mask: '*'
	}
];

export async function promptEmailSetup() {
	const answers = await inquirer.prompt(emailQuestions);
	const action = await confirmAction('Review your email configuration:');

	if (action === 'cancel') {
		console.log('Email configuration canceled.');
		return null;
	}

	return answers;
}
