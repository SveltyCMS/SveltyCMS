// Database questions...

const databaseOptions = [
	{ name: 'Use Docker MongoDB (Recommended for Development)', value: 'docker' },
	{ name: 'Use MongoDB Atlas (Recommended for Production)', value: 'atlas' },
	{ name: 'Use Local MongoDB Instance', value: 'local' }
];

export const databaseQuestions = [
	{
		type: 'list',
		name: 'databaseOption',
		message: 'Choose your database option:',
		choices: databaseOptions
	},
	{
		type: 'input',
		name: 'DB_NAME',
		message: 'Enter the database name:',
		default: 'SveltyCMS'
	},
	{
		type: 'input',
		name: 'DB_USER',
		message: 'Enter the database user (leave blank if not required):'
	},
	{
		type: 'password',
		name: 'DB_PASSWORD',
		message: 'Enter the database password (leave blank if not required):',
		mask: '*'
	},
	{
		type: 'input',
		name: 'DB_HOST',
		message: 'Enter the database host:',
		default: (answers) => {
			switch (answers.databaseOption) {
				case 'docker':
					return 'mongodb://localhost:27017';
				case 'atlas':
					return ''; // Add your default MongoDB Atlas connection string here
				case 'local':
					return 'mongodb://localhost:27017';
				default:
					return '';
			}
		},
		when: (answers) => ['docker', 'local'].includes(answers.databaseOption)
	}
];
