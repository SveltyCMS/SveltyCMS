import blessed from 'blessed';
import inquirer from 'inquirer';

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

async function displayQuestionMenu() {
	// Create a screen object
	const screen = blessed.screen({
		smartCSR: true,
		fullscreen: true
	});

	const header = blessed.text({
		parent: screen,
		top: 0,
		left: 'center',
		content: 'SveltyCMS Installer',
		style: {
			fg: 'red',
			bold: true
		},
		width: 'shrink'
	});

	// Show green Selector Title
	const currentSelection = blessed.text({
		parent: screen,
		top: 2,
		left: 'center',
		content: '',
		style: {
			fg: 'green'
		},
		width: 'shrink'
	});

	// Show green Selector Description
	const currentDescription = blessed.text({
		parent: screen,
		top: 3,
		left: 'center',
		content: '',
		style: {
			fg: 'green'
		},
		width: 'shrink'
	});

	const menu = blessed.list({
		parent: screen,
		top: 3,
		left: 0,
		width: '100%',
		height: '80%',
		border: 'line',
		keys: true,
		vi: true,
		mouse: true,
		style: {
			selected: {
				bg: 'blue',
				fg: 'white'
			}
		},
		items: ['Database', 'Email', 'System', 'Language', 'Media', 'Google', 'Redis', 'Mapbox', 'Ticktok', 'OpenAI'].map(
			(option, index) => `${index + 1}. ${option.replace('*', '')} [${option.includes('*') ? '' : ' '}] `
		)
	});

	const footer = blessed.text({
		parent: screen,
		bottom: 0,
		left: 'center',
		content: ' Use arrow keys to navigate, Enter to select & Esc to exit ',
		style: {
			fg: 'white',
			bg: 'grey'
		},
		width: '100%'
	});

	const saveButton = blessed.button({
		parent: screen,
		bottom: 1,
		right: 12,
		mouse: true,
		keys: true,
		shrink: true,
		padding: {
			left: 1,
			right: 1
		},
		style: {
			bg: 'green',
			fg: 'white',
			bold: true,
			hover: {
				bg: 'green'
			}
		},
		content: ' Save '
	});

	const exitButton = blessed.button({
		parent: screen,
		bottom: 1,
		right: 0,
		mouse: true,
		keys: true,
		shrink: true,
		padding: {
			left: 1,
			right: 1
		},
		style: {
			bg: 'blue',
			fg: 'white',
			bold: true,
			hover: {
				bg: 'green'
			}
		},
		content: ' Exit '
	});

	screen.key(['escape', 'q'], () => {
		process.exit(0);
	});

	saveButton.on('press', () => {
		// Save logic here
		console.log('Save button pressed');
	});

	exitButton.on('press', () => {
		process.exit(0);
	});

	menu.on('select', async (item) => {
		const selectedSection = item.content.split('.')[1].trim().toLowerCase().replace(/ /g, '');
		currentSelection.setContent(`Selected: ${item.content.split('.')[1].trim()}`);
		screen.render();
		let answers = {};

		switch (selectedSection) {
			case 'databaseconfiguration':
				answers = await inquirer.prompt(promptdatabaseSetup);
				// Call testDatabaseConnection function with the answers
				await testDatabaseConnection(answers);
				break;
			case 'emailconfiguration':
				answers = await inquirer.prompt(promptEmailSetup);
				break;
			// ... (other cases)
		}
	});

	screen.render();
}

async function main() {
	try {
		console.clear();
		console.log('\x1b[31m%s\x1b[0m', 'Welcome to the SveltyCMS installer!');
		console.log();

		await displayQuestionMenu();
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

main();
