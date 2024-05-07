export const systemQuestions = [
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
		default: 8
	},
	{
		type: 'input',
		name: 'BODY_SIZE_LIMIT',
		message: 'Enter the body size limit (default: 100mb):',
		default: '100mb',
		validate: (value) => {
			const num = parseInt(value);
			return !isNaN(num) && num > 0 ? true : 'Please enter a valid number greater than 0.';
		}
	}
];
