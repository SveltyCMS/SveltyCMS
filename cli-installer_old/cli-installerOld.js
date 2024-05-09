import inquirer from 'inquirer';
import { spawn } from 'child_process';

// Questions
import { promptdatabaseSetup } from './databaseQuestions.js';
import { promptEmailSetup } from './emailQuestions.js';
import { promptSystemSetup } from './systemQuestions.js';
import { promptLanguageSetup } from './languageQuestions.js';
import { promptMediaSetup } from './mediaQuestions.js';
import { promptGoogleSetup } from './googleQuestions.js';
import { promptRedisSetup } from './redisQuestions.js';
import { promptMapboxSetup } from './mapboxQuestions.js';
import { promptTicktokSetup } from './ticktokQuestions.js';
import { promptOpenAISetup } from './openaiQuestions.js';

// Create or Update Config File
import { createOrUpdateConfigFile } from './createOrUpdateConfigFile.js';

// Function to test database connection
import { testDatabaseConnection } from './testDatabaseConnection.js';

// Check if config exists
import { checkExistingConfig, loadExistingConfig } from './setupConfiguration.js';

// Start dev or build process
import { startProcess } from './startProcess.js';

async function displayQuestionMenu() {
	try {
		let databaseAnswers = {};
		let emailAnswers = {};

		// Define menu options
		const menuOptions = [
			{ name: 'Database Configuration *', value: 'database', completed: false, required: true },
			{ name: 'Email Configuration *', value: 'email', completed: false, required: true },
			{ name: 'System Configuration', value: 'system', completed: false },
			{ name: 'Language Configuration', value: 'language', completed: false },
			{ name: 'Media Configuration', value: 'media', completed: false },
			{ name: 'Google Configuration', value: 'google', completed: false },
			{ name: 'Redis Configuration', value: 'redis', completed: false },
			{ name: 'Mapbox Configuration', value: 'mapbox', completed: false },
			{ name: 'Ticktok Configuration', value: 'ticktok', completed: false },
			{ name: 'OpenAI Configuration', value: 'openai', completed: false }
		];

		const pageSize = 9; // Number of options per page
		let currentPage = 0;

		const keepGoing = true;
		while (keepGoing) {
			const choices = menuOptions.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
			const { selectedOption } = await inquirer.prompt({
				type: 'list',
				name: 'selectedOption',
				message: `Choose a section to edit - (Page ${currentPage + 1} of ${Math.ceil(menuOptions.length / pageSize)})`,
				choices: choices.map((option, index) => ({
					name: `${index + 1}. [${option.completed ? '✓' : ' '}] ${option.name}${option.completed ? ' (Completed)' : ''}`,
					value: option.value,
					disabled: option.completed && !option.required
				})),
				pageSize: pageSize
			});

			if (selectedOption === 'exit') {
				break;
			}

			switch (selectedOption) {
				case 'database':
					databaseAnswers = await inquirer.prompt(promptdatabaseSetup);
					break;
				case 'email':
					emailAnswers = await inquirer.prompt(promptEmailSetup);
					break;
				case 'system':
					await inquirer.prompt(promptSystemSetup);
					break;
				case 'language':
					await inquirer.prompt(promptLanguageSetup);
					break;
				case 'media':
					await inquirer.prompt(promptMediaSetup);
					break;
				case 'google':
					await inquirer.prompt(promptGoogleSetup);
					break;
				case 'redis':
					await inquirer.prompt(promptRedisSetup);
					break;
				case 'mapbox':
					await inquirer.prompt(promptMapboxSetup);
					break;
				case 'ticktok':
					await inquirer.prompt(promptTicktokSetup);
					break;
				case 'openai':
					await inquirer.prompt(promptOpenAISetup);
					break;
				case 'prev':
					currentPage = Math.max(0, currentPage - 1);
					break;
				case 'next':
					currentPage = Math.min(currentPage + 1, Math.floor(menuOptions.length / pageSize));
					break;
			}
		}

		// Check if both database and email configurations have values
		if (!databaseAnswers || !emailAnswers) {
			console.log('Database and Email configurations are required. Please provide values for both.');
			return;
		}
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

async function main() {
	try {
		// Clear the terminal
		console.clear();

		console.log('\x1b[31m%s\x1b[0m', 'Welcome to the SveltyCMS installer!'); // Red color for the welcome message
		console.log();

		// Check if existing configuration files are found
		const { privateConfigExists, publicConfigExists } = await checkExistingConfig();
		const loadExistingConfig = privateConfigExists || publicConfigExists;

		if (loadExistingConfig) {
			// Load existing configuration data
			console.log('Existing SveltyCMS configuration found.');
			console.log('Would you like to use this configuration or start fresh?');
			console.log();

			// Load existing configuration data
			const { privateConfig, publicConfig } = await loadExistingConfig();
			await displayQuestionMenu(privateConfig, publicConfig);
		} else {
			// No existing configuration data found, proceed with setup
			console.log('This installer will guide you through the setup process for SveltyCMS.');
			console.log('Please answer the following questions to complete the setup.');
			console.log();
		}

		// Proceed with the question menu for now
		await new Promise((resolve) => setTimeout(resolve, 1000)); // Add a delay of 1 second (1000 milliseconds)
		await displayQuestionMenu();
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

// Call the main function
main();
