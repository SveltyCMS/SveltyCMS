/** 
@file cli-installer/config/system.js
@description Configuration prompts for the System section
*/

import { confirm, text, note, select, isCancel, cancel, multiselect } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';
import crypto from 'crypto';

function generateRandomJWTSecret(length = 32) {
	return crypto.randomBytes(length).toString('hex');
}

export async function configureSystem(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the System configuration
	note(
		`The System configuration allows you to set essential settings for\n` +
			`your site, such as site name, host names for development and production,\n` +
			`password strength, body size limit, and optional seasonal settings.`,
		pc.green('System Configuration:')
	);

	// Display existing configuration
	note(
		`SITE_NAME: ${pc.red(privateConfigData.SITE_NAME)}\n` +
			`HOST_DEV: ${pc.red(privateConfigData.HOST_DEV)}\n` +
			`HOST_PROD: ${pc.red(privateConfigData.HOST_PROD)}\n` +
			`PASSWORD_STRENGTH: ${pc.red(privateConfigData.PASSWORD_STRENGTH?.toString())}\n` +
			`BODY_SIZE_LIMIT: ${pc.red(privateConfigData.BODY_SIZE_LIMIT ? privateConfigData.BODY_SIZE_LIMIT + 'b' : 'Not set')}\n` +
			`MAX_FILE_SIZE: ${pc.red(privateConfigData.MAX_FILE_SIZE ? privateConfigData.MAX_FILE_SIZE + 'b' : 'Not set')}\n` +
			`EXTRACT_DATA_PATH:${pc.red(privateConfigData.EXTRACT_DATA_PATH)}\n` +
			`LOG_LEVELS: ${pc.red(privateConfigData.LOG_LEVELS ? privateConfigData.LOG_LEVELS.join(', ') : 'Not set')}\n` +
			`SESSION_CLEANUP_INTERVAL: ${pc.green(privateConfigData.SESSION_CLEANUP_INTERVAL)}\n` +
			`MAX_IN_MEMORY_SESSIONS: ${pc.green(privateConfigData.MAX_IN_MEMORY_SESSIONS)}\n` +
			`DB_VALIDATION_PROBABILITY: ${pc.green(privateConfigData.DB_VALIDATION_PROBABILITY)}\n` +
			`SESSION_EXPIRATION_SECONDS: ${pc.green(privateConfigData.SESSION_EXPIRATION_SECONDS)}n` +
			`SEASONS: ${pc.red(privateConfigData.SEASONS ? 'true' : 'false')}\n` +
			`SEASONS_REGION: ${pc.red(privateConfigData.SEASONS_REGION)}\n` +
			`JWT_SECRET_KEY: ${pc.red(privateConfigData.JWT_SECRET)}`,
		pc.red('Existing System Configuration:')
	);

	const SITE_NAME = await text({
		message: 'Enter the site name:',
		placeholder: 'SveltyCMS',
		initialValue: privateConfigData.SITE_NAME || 'SveltyCMS',
		validate(value) {
			if (value.length === 0) return `Site name is required!`;
		}
	});

	if (isCancel(SITE_NAME)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const HOST_DEV = await text({
		message: 'Enter the hostname for development:',
		placeholder: 'http://localhost:5173',
		initialValue: privateConfigData.HOST_DEV || 'http://localhost:5173',
		validate(value) {
			if (value.length === 0) return `Hostname is required!`;
		}
	});

	if (isCancel(HOST_DEV)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const HOST_PROD = await text({
		message: 'Enter the Domain name for production:',
		placeholder: 'https://yourdomain.com',
		initialValue: privateConfigData.HOST_PROD || 'https://sveltycms.com',
		validate(value) {
			if (value.length === 0) return `Domain name is required!`;
		}
	});

	if (isCancel(HOST_PROD)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const PASSWORD_STRENGTH = await text({
		message: 'Enter the password strength (default: 8):',
		placeholder: '8',
		initialValue: privateConfigData.PASSWORD_STRENGTH?.toString() || '8',
		validate(value) {
			if (value.length === 0) return `Password strength is required!`;
		}
	});

	if (isCancel(PASSWORD_STRENGTH)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let maxFileSizeOutput = 0;
	if (privateConfigData.MAX_FILE_SIZE && privateConfigData.MAX_FILE_SIZE.endsWith('gb')) {
		maxFileSizeOutput = Number(privateConfigData.MAX_FILE_SIZE.split('gb')[0]) * 1024 * 1024 * 1024;
	} else if (privateConfigData.MAX_FILE_SIZE && privateConfigData.MAX_FILE_SIZE.endsWith('mb')) {
		maxFileSizeOutput = Number(privateConfigData.MAX_FILE_SIZE.split('mb')[0]) * 1024 * 1024;
	} else if (privateConfigData.MAX_FILE_SIZE && privateConfigData.MAX_FILE_SIZE.endsWith('kb')) {
		maxFileSizeOutput = Number(privateConfigData.MAX_FILE_SIZE.split('kb')[0]) * 1024;
	} else if (privateConfigData.MAX_FILE_SIZE && privateConfigData.MAX_FILE_SIZE.endsWith('b')) {
		maxFileSizeOutput = Number(privateConfigData.MAX_FILE_SIZE.split('b')[0]);
	}

	const MAX_FILE_SIZE = await text({
		message: 'Enter the max file size (default: 10mb):',
		placeholder: '10mb',
		initialValue: privateConfigData.MAX_FILE_SIZE ? privateConfigData.MAX_FILE_SIZE.toString() : '10mb',
		validate(value) {
			const regex = /^(\d+)(mb|kb|gb|b)$/i;
			if (!regex.test(value)) {
				return 'Please enter a valid size format (e.g., 10mb, 2gb, 50kb).';
			}
		}
	});

	// Cancel handling
	if (isCancel(MAX_FILE_SIZE)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let bodySizeParsed = privateConfigData.BODY_SIZE_LIMIT;
	let bodySizeUnit = 'b';
	if (bodySizeParsed) {
		if (bodySizeParsed / 1024 > 1) {
			bodySizeParsed /= 1024;
			bodySizeUnit = 'kb';
		}
		if (bodySizeParsed / 1024 > 1) {
			bodySizeParsed /= 1024;
			bodySizeUnit = 'mb';
		}
		if (bodySizeParsed / 1024 > 1) {
			bodySizeParsed /= 1024;
			bodySizeUnit = 'gb';
		}
	}

	const BODY_SIZE_LIMIT = await text({
		message: 'Enter the body size limit (default: 100mb):',
		placeholder: '100mb',
		initialValue: privateConfigData.BODY_SIZE_LIMIT ? bodySizeParsed + bodySizeUnit : '100mb',
		validate(value) {
			const regex = /^(\d+)(mb|kb|gb|b)$/i;
			if (!regex.test(value)) {
				return 'Please enter a valid size format (e.g., 100mb, 2gb, 50kb).';
			}
		}
	});

	if (isCancel(BODY_SIZE_LIMIT)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const EXTRACT_DATA_PATH = await confirm({
		message: 'Path to extract data to?',
		placeholder: 'default: current directory',
		initialValue: privateConfigData.EXTRACT_DATA_PATH || ''
	});

	if (isCancel(EXTRACT_DATA_PATH)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Prompt for log levels using multiselect
	const LOG_LEVELS = await multiselect({
		message: 'Select log levels to be outputted:',
		options: [
			{ value: 'debug', label: 'Debug' },
			{ value: 'info', label: 'Info' },
			{ value: 'warn', label: 'Warn' },
			{ value: 'error', label: 'Error' },
			{ value: 'none', label: 'None' }
		],
		initialValues: privateConfigData.LOG_LEVELS || ['error']
	});

	if (isCancel(LOG_LEVELS)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const SESSION_CLEANUP_INTERVAL = await text({
		message: 'Enter the session cleanup interval in milliseconds (default: 60000):',
		placeholder: '60000',
		initialValue: privateConfigData.SESSION_CLEANUP_INTERVAL?.toString() || '60000',
		validate(value) {
			if (isNaN(Number(value))) return `Please enter a valid number.`;
		}
	});

	if (isCancel(SESSION_CLEANUP_INTERVAL)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt();
		return;
	}

	const MAX_IN_MEMORY_SESSIONS = await text({
		message: 'Enter the maximum number of in-memory sessions (default: 10000):',
		placeholder: '10000',
		initialValue: privateConfigData.MAX_IN_MEMORY_SESSIONS?.toString() || '10000',
		validate(value) {
			if (isNaN(Number(value))) return `Please enter a valid number.`;
		}
	});

	if (isCancel(MAX_IN_MEMORY_SESSIONS)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt();
		return;
	}

	const DB_VALIDATION_PROBABILITY = await text({
		message: 'Enter the database validation probability (0-1, default: 0.1):',
		placeholder: '0.1',
		initialValue: privateConfigData.DB_VALIDATION_PROBABILITY?.toString() || '0.1',
		validate(value) {
			const num = Number(value);
			if (isNaN(num) || num < 0 || num > 1) return `Please enter a valid number between 0 and 1.`;
		}
	});

	if (isCancel(DB_VALIDATION_PROBABILITY)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt();
		return;
	}

	const SESSION_EXPIRATION_SECONDS = await text({
		message: 'Enter the session expiration time in seconds (default: 3600):',
		placeholder: '3600',
		initialValue: privateConfigData.SESSION_EXPIRATION_SECONDS?.toString() || '3600',
		validate(value) {
			if (isNaN(Number(value))) return `Please enter a valid number.`;
		}
	});

	if (isCancel(SESSION_EXPIRATION_SECONDS)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt();
		return;
	}

	const SEASONS = await confirm({
		message: 'Do you want to enable seasons?',
		placeholder: 'false / true',
		initialValue: privateConfigData.SEASONS || false
	});

	if (isCancel(SEASONS)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let SEASONS_REGION;
	if (SEASONS) {
		SEASONS_REGION = await select({
			message: 'Select a region for seasonal content:',
			options: [
				{ value: 'Western_Europe', label: 'Western Europe', hint: 'New Year, Easter, Halloween, Christmas' },
				{ value: 'South_Asia', label: 'South Asia', hint: 'Diwali' },
				{ value: 'East_Asia', label: 'East Asia', hint: 'Chinese New Year' }
			],
			initialValue: privateConfigData.SEASONS_REGION || 'Western_Europe'
		});

		if (isCancel(SEASONS_REGION)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}
	}

	const JWT_SECRET_KEY = await text({
		message: 'Enter the secret key for signing and verifying JWTs:',
		placeholder: generateRandomJWTSecret(), // Ensure this is executed correctly
		initialValue: privateConfigData.JWT_SECRET_KEY || generateRandomJWTSecret(),
		validate(value) {
			if (value.length === 0) return `JWT secret key is required!`;
		}
	});

	if (isCancel(JWT_SECRET_KEY)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Summary
	note(
		`SITE_NAME: ${pc.green(SITE_NAME)}\n` +
			`HOST_DEV: ${pc.green(HOST_DEV)}\n` +
			`HOST_PROD: ${pc.green(HOST_PROD)}\n` +
			`PASSWORD_STRENGTH: ${pc.green(PASSWORD_STRENGTH)}\n` +
			`BODY_SIZE_LIMIT: ${pc.green(BODY_SIZE_LIMIT)}\n` +
			`EXTRACT_DATA_PATH: ${pc.green(EXTRACT_DATA_PATH)}\n` +
			`MAX_FILE_SIZE: ${pc.green(MAX_FILE_SIZE)}\n` +
			`LOG_LEVELS: ${pc.green(LOG_LEVELS.join(', '))}\n` +
			`SESSION_CLEANUP_INTERVAL: ${pc.green(SESSION_CLEANUP_INTERVAL)}\n` +
			`MAX_IN_MEMORY_SESSIONS: ${pc.green(MAX_IN_MEMORY_SESSIONS)}\n` +
			`DB_VALIDATION_PROBABILITY: ${pc.green(DB_VALIDATION_PROBABILITY)}\n` +
			`SESSION_EXPIRATION_SECONDS: ${pc.green(SESSION_EXPIRATION_SECONDS)}\n` +
			`JWT_SECRET_KEY: ${pc.green(JWT_SECRET_KEY)}`,
		`SEASONS: ${pc.green(SEASONS)}\n` + `SEASONS_REGION: ${pc.green(SEASONS && SEASONS_REGION ? SEASONS_REGION : 'Not enabled')}`,
		pc.green('Review your System configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

	if (isCancel(action)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	if (!action) {
		console.log('System configuration canceled.');
		const restartOrExit = await select({
			message: 'Do you want to restart or exit?',
			options: [
				{ value: 'restart', label: 'Restart', hint: 'Start again' },
				{ value: 'cancel', label: 'Cancel', hint: 'Clear and return to selection' },
				{ value: 'exit', label: 'Exit', hint: 'Quit the installer' }
			]
		});

		if (isCancel(restartOrExit)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		if (restartOrExit === 'restart') {
			return configureSystem();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	let bodySizeLimitOutput = 0;
	if (BODY_SIZE_LIMIT.endsWith('gb')) {
		bodySizeLimitOutput = Number(BODY_SIZE_LIMIT.split('gb')[0]) * 1024 * 1024 * 1024;
	} else if (BODY_SIZE_LIMIT.endsWith('mb')) {
		bodySizeLimitOutput = Number(BODY_SIZE_LIMIT.split('mb')[0]) * 1024 * 1024;
	} else if (BODY_SIZE_LIMIT.endsWith('kb')) {
		bodySizeLimitOutput = Number(BODY_SIZE_LIMIT.split('kb')[0]) * 1024;
	} else if (BODY_SIZE_LIMIT.endsWith('b')) {
		bodySizeLimitOutput = Number(BODY_SIZE_LIMIT.split('b')[0]);
	}
	return {
		SITE_NAME,
		HOST_DEV,
		HOST_PROD,
		PASSWORD_STRENGTH,
		BODY_SIZE_LIMIT: bodySizeLimitOutput,
		MAX_FILE_SIZE: maxFileSizeOutput,
		EXTRACT_DATA_PATH,
		LOG_LEVELS,
		SESSION_CLEANUP_INTERVAL: Number(SESSION_CLEANUP_INTERVAL),
		MAX_IN_MEMORY_SESSIONS: Number(MAX_IN_MEMORY_SESSIONS),
		DB_VALIDATION_PROBABILITY: Number(DB_VALIDATION_PROBABILITY),
		SESSION_EXPIRATION_SECONDS: Number(SESSION_EXPIRATION_SECONDS),
		SEASONS,
		SEASONS_REGION,
		JWT_SECRET_KEY
	};
}
