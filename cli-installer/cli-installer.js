import inquirer from 'inquirer';

// Questions
import { databaseQuestions } from './databaseQuestions.js';
import { emailQuestions } from './emailQuestions.js';
import { systemQuestions } from './systemQuestions.js';
import { languageQuestions } from './languageQuestions.js';
import { getMediaQuestions, getMediaConfig } from './mediaQuestions.js';
import { googleQuestions } from './googleQuestions.js';
import { redisQuestions } from './redisQuestions.js';
import { mapboxQuestions } from './mapboxQuestions.js';
import { ticktokQuestions } from './ticktokQuestions.js';
import { openaiQuestions } from './openaiQuestions.js';

// Create or Update Config File
import { createOrUpdateConfigFile } from './createOrUpdateConfigFile.js';

// Function to test database connection
import { testDatabaseConnection } from './testDatabaseConnection.js';

// Check if config exists
import { setupConfiguration } from './setupConfiguration.js';

// Start dev or build process
import { startProcess } from './startProcess.js';

// Function to print the message with animation
function printWelcomeMessage(message) {
	const animationFrames = ['-', '\\', '|', '/']; // Frames for the animation
	let currentFrameIndex = 0;

	// Print the initial message without a newline character
	process.stdout.write(message);

	// Start the animation timer
	const animationInterval = setInterval(() => {
		// Move the cursor to the beginning of the line and clear the line
		process.stdout.write('\r \r');

		// Print the message with the current animation frame
		process.stdout.write(`${message} ${animationFrames[currentFrameIndex]}`);

		// Move to the next animation frame
		currentFrameIndex = (currentFrameIndex + 1) % animationFrames.length;
	}, 100); // Adjust the animation speed (milliseconds per frame)

	// Stop the animation after 3 seconds (3000 milliseconds)
	setTimeout(() => {
		clearInterval(animationInterval); // Stop the animation timer
		console.log(); // Add a newline character after the animation
		console.log('Thank you for choosing SveltyCMS.'); // Print the rest of the message
	}, 3000); // Adjust the duration of the animation (milliseconds)
}

async function newConfigSetup() {
	try {
		const welcomeMessage = 'Welcome to the SveltyCMS installer!';

		printWelcomeMessage(welcomeMessage);

		console.log('\x1b[31m%s\x1b[0m', 'Thank you for choosing SveltyCMS.'); // Red color for the welcome message

		// Check if config exists
		const { privateConfig, publicConfig } = await setupConfiguration();

		// Prompt the user to answer database questions
		const databaseAnswers = await inquirer.prompt(databaseQuestions);

		// Test database connection
		const dbConnectionSuccessful = await testDatabaseConnection(databaseAnswers.DB_OPTION, databaseAnswers);
		if (!dbConnectionSuccessful) {
			console.error('Database connection failed. Please check your credentials and try again.');
			return; // Exit if database connection fails
		}

		// If database connection is successful, proceed to email questions
		const emailAnswers = await inquirer.prompt(emailQuestions);

		// Proceed with additional questions here...

		// Initialize answers object
		let answers = {};

		// Create or update configuration files
		console.log('Creating or updating configuration files...');
		await createOrUpdateConfigFile({ ...privateConfig, ...answers }, { ...publicConfig, ...answers });
		console.log('\x1b[32m%s\x1b[0m', 'Configuration updated successfully!'); // Green color for success message

		// Start dev or build process
		// Additional logic here...
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

// async function existingConfigSetup() {
// 	try {
// 		console.log('This installer will guide you through the setup process for SveltyCMS.');

// 		// Check if config exists
// 		const { privateConfig, publicConfig } = await setupConfiguration();

// 		// Initialize answers object
// 		let answers = {};

// 		// Create or update configuration files
// 		console.log('Creating or updating configuration files...');
// 		await createOrUpdateConfigFile({ ...privateConfig, ...answers }, { ...publicConfig, ...answers });
// 		console.log('\x1b[32m%s\x1b[0m', 'Configuration updated successfully!'); // Green color for success message

// 		let databaseAnswers = {};
// 		let emailAnswers = {};

// 		if (privateConfig && privateConfig.privateEnv) {
// 			databaseAnswers = privateConfig.privateEnv;
// 			emailAnswers = privateConfig.privateEnv;
// 		} else {
// 			databaseAnswers = await inquirer.prompt(databaseQuestions);
// 		}

// 		if (publicConfig && publicConfig.publicEnv) {
// 			emailAnswers = publicConfig.publicEnv;
// 		} else {
// 			emailAnswers = await inquirer.prompt(emailQuestions);
// 		}

// 		const systemAnswers = await inquirer.prompt(systemQuestions);
// 		const languageAnswers = await inquirer.prompt(languageQuestions);
// 		const mediaAnswers = await getMediaConfig();
// 		const googleAnswers = await inquirer.prompt(googleQuestions);
// 		const redisAnswers = await inquirer.prompt(redisQuestions);
// 		const mapboxAnswers = await inquirer.prompt(mapboxQuestions);
// 		const ticktokAnswers = await inquirer.prompt(ticktokQuestions);
// 		const openaiAnswers = await inquirer.prompt(openaiQuestions);

// 		answers = {
// 			...databaseAnswers,
// 			...emailAnswers,
// 			...languageAnswers,
// 			...mediaAnswers,
// 			...systemAnswers,
// 			...googleAnswers,
// 			...redisAnswers,
// 			...mapboxAnswers,
// 			...ticktokAnswers,
// 			...openaiAnswers
// 		};

// 		await createOrUpdateConfigFile(answers);

// 		// Start dev or build process
// 		await startProcess();
// 	} catch (error) {
// 		console.error('An error occurred:', error);
// 	}
// }

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
			{ name: 'OpenAI Configuration', value: 'openai', completed: false },
			{ name: 'Save configuration', value: 'save' },
			{ name: 'Exit installer', value: 'exit' }
		];

		const continueEditing = true;
		while (continueEditing) {
			// Display menu of choices
			const { section } = await inquirer.prompt({
				type: 'list',
				name: 'section',
				message: 'Choose a section to edit:',
				choices: menuOptions.map((option) => ({
					name: `[${option.completed ? '\x1b[32m\u2713\x1b[0m' : ' '}] ${option.name}${option.completed ? ' \x1b[32m\u2713 [Completed]\x1b[0m' : ''}`,
					value: option.value
				})),
				pageSize: 5, // Limit the number of options displayed before showing scrollbar
				loop: false, // Disable infinite scrolling
				// Event handler for keypress
				filter: function (input) {
					// If the user presses escape, exit the menu
					if (input === '\u001b') {
						console.log('Exiting...');
						process.exit(0); // Exit the process
					}
					return input;
				}
			});

			// Reset completed status when returning to main menu
			menuOptions.forEach((option) => {
				if (option.value !== section) {
					option.completed = false;
				}
			});

			// Exit if the user chooses to exit
			if (section === 'exit') {
				console.log('Exiting...');
				break;
			}

			// Prompt the user with the questions based on their selection
			switch (section) {
				case 'database':
					databaseAnswers = await inquirer.prompt(databaseQuestions);
					menuOptions.find((option) => option.value === 'database').completed = true;
					break;
				case 'email':
					emailAnswers = await inquirer.prompt(emailQuestions);
					menuOptions.find((option) => option.value === 'email').completed = true;
					break;
				case 'system':
					// Prompt user for system configuration questions
					await inquirer.prompt(systemQuestions); // Prompt user for system configuration questions
					menuOptions.find((option) => option.value === 'system').completed = true;
					break;
				case 'language':
					await inquirer.prompt(languageQuestions);
					menuOptions.find((option) => option.value === 'language').completed = true;
					break;
				case 'media':
					await inquirer.prompt(mediaQuestions);
					menuOptions.find((option) => option.value === 'media').completed = true;
					break;
				case 'google':
					await inquirer.prompt(googleQuestions);
					menuOptions.find((option) => option.value === 'google').completed = true;
					break;
				case 'redis':
					await inquirer.prompt(redisQuestions);
					menuOptions.find((option) => option.value === 'redis').completed = true;
					break;
				case 'mapbox':
					await inquirer.prompt(mapboxQuestions);
					menuOptions.find((option) => option.value === 'mapbox').completed = true;
					break;
				case 'ticktok':
					await inquirer.prompt(ticktokQuestions);
					menuOptions.find((option) => option.value === 'ticktok').completed = true;
					break;
				case 'openai':
					await inquirer.prompt(openaiQuestions);
					menuOptions.find((option) => option.value === 'openai').completed = true;
					break;
				default:
					console.log('Invalid selection. Please choose a valid option.');
					continue;
			}
		}

		// Check if both database and email configurations have values
		if (!databaseAnswers || !emailAnswers) {
			console.log('Database and Email configurations are required. Please provide values for both.');
			return;
		}

		// Save the configuration
		// Add your logic to save the configuration here...
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

async function main() {
	try {
		console.log('\x1b[31m%s\x1b[0m', 'Welcome to the SveltyCMS installer!'); // Red color for the welcome message
		console.log();
		console.log('This installer will guide you through the setup process for SveltyCMS.');
		console.log('Please answer the following questions to complete the setup.');
		console.log();

		// Check if existing configuration files are found
		const { privateConfig, publicConfig } = await setupConfiguration();
		const loadExistingConfig = privateConfig || publicConfig;

		if (loadExistingConfig) {
			// Load existing configuration data
			await displayQuestionMenu(); // Call a function to display menu of questions for editing
		} else {
			// No existing configuration data found, proceed with setup

			console.log('Thank you for choosing SveltyCMS.');
			console.log();
			console.log('Starting new configuration setup...');
			await startNewConfigSetup(); // Call the function to start the setup process
		}
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

// Call the main function
main();
