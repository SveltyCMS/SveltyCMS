export const emailQuestions = [
	{
		type: 'list',
		name: 'SMTP_PROVIDER',
		message: 'Select your SMTP provider or choose Custom for custom settings:',
		choices: ['Gmail', 'Outlook', 'Web.de', 'Yahoo', 'Custom']
	},
	{
		type: 'input',
		name: 'SMTP_HOST',
		message: 'Enter the SMTP host:',
		default: (answers) => {
			switch (answers.SMTP_PROVIDER) {
				case 'Gmail':
					return 'smtp.gmail.com';
				case 'Outlook':
					return 'smtp.office365.com';
				case 'Web.de':
					return 'smtp.web.de';
				case 'Yahoo':
					return 'smtp.mail.yahoo.com';
				default:
					return '';
			}
		},
		when: (answers) => ['Custom'].includes(answers.SMTP_PROVIDER)
	},
	{
		type: 'input',
		name: 'SMTP_PORT',
		message: 'Enter the SMTP port:',
		default: (answers) => {
			switch (answers.SMTP_PROVIDER) {
				case 'Gmail':
				case 'Outlook':
				case 'Web.de':
				case 'Yahoo':
					return 587;
				default:
					return '';
			}
		},
		validate: (value) => /^\d+$/.test(value) || 'Please enter a valid port number.',
		when: (answers) => ['Custom'].includes(answers.SMTP_PROVIDER)
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
