import inquirer from 'inquirer';
import { confirmAction } from './confirmAction.js';

const redisQuestions = [
	{
		type: 'confirm',
		name: 'USE_REDIS',
		message: 'Do you want to enable Redis caching?',
		default: false
	},
	{
		type: 'input',
		name: 'REDIS_HOST',
		message: 'Enter the Redis host:',
		when: (answers) => answers.USE_REDIS,
		default: 'localhost'
	},
	{
		type: 'input',
		name: 'REDIS_PORT',
		message: 'Enter the Redis port:',
		when: (answers) => answers.USE_REDIS,
		default: '6379',
		validate: (value) => /^\d+$/.test(value) || 'Please enter a valid port number.'
	},
	{
		type: 'password',
		name: 'REDIS_PASSWORD',
		message: 'Enter the Redis password (leave blank if not required):',
		when: (answers) => answers.USE_REDIS,
		mask: '*'
	}
];

export async function promptRedisSetup() {
	const answers = await inquirer.prompt(redisQuestions);

	const action = await confirmAction('Review your Redis configuration:');
	if (action === 'cancel') {
		console.log('Redis configuration canceled.');
		return null;
	}

	return answers;
}
