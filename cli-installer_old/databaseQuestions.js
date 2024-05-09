import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const databaseOptions = [
	{ name: 'Use Docker MongoDB (Recommended for Development)', value: 'docker' },
	{ name: 'Use MongoDB Atlas (Recommended for Production)', value: 'atlas' },
	{ name: 'Use Local MongoDB Instance', value: 'local' }
];

const databaseQuestions = [
	{
		type: 'list',
		name: 'databaseOption',
		message: 'Choose your database option:',
		choices: databaseOptions.map((option) => ({
			name: option.name,
			value: option.value
		}))
	},
	{
		type: 'input',
		name: 'DB_NAME',
		message: 'Enter the database name:',
		default: 'SveltyCMS',
		validate: (value) => {
			if (!value.trim()) {
				return 'Database name is required.';
			}
			return true;
		}
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
					return ''; // Placeholder for Docker connection string
				case 'atlas':
					return ''; // Placeholder for Atlas connection string
				case 'local':
					return 'mongodb://localhost:27017';
				default:
					return '';
			}
		},
		when: (answers) => ['local'].includes(answers.databaseOption)
	}
];

export async function promptdatabaseSetup() {
	const answers = await inquirer.prompt(databaseQuestions);

	if (answers.databaseOption === 'atlas') {
		// Steps for MongoDB Atlas setup
		console.log('\nFor MongoDB Atlas, please follow these steps:\n');
		console.log('1. Go to your MongoDB Atlas cluster');
		console.log('2. Click on "Connect"');
		console.log('3. Click on "Connect your application"');
		console.log('4. Select "MongoDB Shell" as the driver');
		console.log('5. Copy the connection string');

		const { atlasConnectionString } = await inquirer.prompt({
			type: 'input',
			name: 'atlasConnectionString',
			message: 'Paste the MongoDB Atlas connection string:',
			validate: (value) => {
				if (!value.trim()) {
					return 'Connection string is required.';
				}
				return true;
			}
		});

		answers.DB_HOST = atlasConnectionString;
	} else if (answers.databaseOption === 'docker') {
		// Steps for Docker MongoDB setup
		console.log('\nFor Docker MongoDB, please follow these steps:\n');
		console.log('1. Create a docker-compose.yml file with the following content:\n');
		console.log('version: "3.9"');
		console.log('services:');
		console.log('  mongo:');
		console.log('    image: mongo:latest');
		console.log('    ports:');
		console.log('      - 27017:27017');
		console.log('    environment:');
		console.log('      MONGO_INITDB_ROOT_USERNAME: <your-username>');
		console.log('      MONGO_INITDB_ROOT_PASSWORD: <your-password>');
		console.log('\n2. Replace <your-username> and <your-password> with your desired credentials.');
		console.log('3. Save the file and run "docker-compose up" in the same directory.');
		console.log('4. Once the container is running, copy the connection string in the following format:');
		console.log('   mongodb://<your-username>:<your-password>@localhost:27017');

		const { dockerConnectionString } = await inquirer.prompt({
			type: 'input',
			name: 'dockerConnectionString',
			message: 'Paste the Docker MongoDB connection string:',
			validate: (value) => {
				if (!value.trim()) {
					return 'Connection string is required.';
				}
				return true;
			}
		});

		answers.DB_HOST = dockerConnectionString;
	}

	const configAction = await confirmAction('Review your database configuration:');

	if (configAction === 'cancel') {
		console.log('Database configuration canceled.');
		return null;
	}

	return answers;
}
