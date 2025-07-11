/**
 @file cli-installer/config/system.js
 @description Configuration prompts for the System section

 ### Features
 - Displays a note about the System configuration
 - Displays existing configuration (password hidden)
 - Prompts for System integration
 */

import { confirm, text, note, select, isCancel, multiselect, password } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';
import crypto from 'crypto';

// Generate JWT Secret
function generateRandomJWTSecret(length = 64) {
	// Increased default length for better security
	return crypto.randomBytes(length).toString('hex');
}

// Validate positive integer (using new error return)
const validatePositiveInteger = (value, fieldName) => {
	if (value === null || value === undefined || value === '') return { message: `${fieldName} is required.` };
	const num = Number(value);
	if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
		return { message: `${fieldName} must be a positive integer.` };
	}
	return undefined; // Valid
};

// Validate number between 0 and 1 (using new error return)
const validateProbability = (value, fieldName) => {
	if (value === null || value === undefined || value === '') return { message: `${fieldName} is required.` };
	const num = Number(value);
	if (isNaN(num) || num < 0 || num > 1) {
		return { message: `${fieldName} must be a number between 0 and 1.` };
	}
	return undefined; // Valid
};

// Parse size string (e.g., "10mb", "2gb") into bytes
function parseSizeToBytes(sizeString) {
	if (!sizeString || typeof sizeString !== 'string') return 0;
	const match = sizeString.toLowerCase().match(/^(\d+)\s*(gb|mb|kb|b)?$/);
	if (!match) return 0; // Invalid format

	const value = parseInt(match[1], 10);
	const unit = match[2] || 'b'; // Default to bytes if no unit

	switch (unit) {
		case 'gb':
			return value * 1024 * 1024 * 1024;
		case 'mb':
			return value * 1024 * 1024;
		case 'kb':
			return value * 1024;
		case 'b':
			return value;
		default:
			return 0;
	}
}

// Format bytes into a human-readable size string (e.g., "100mb")
function formatBytesToSize(bytes) {
	if (bytes === null || bytes === undefined || isNaN(Number(bytes)) || bytes <= 0) return '';
	const gb = 1024 * 1024 * 1024;
	const mb = 1024 * 1024;
	const kb = 1024;

	if (bytes >= gb && bytes % gb === 0) return `${bytes / gb}gb`;
	if (bytes >= mb && bytes % mb === 0) return `${bytes / mb}mb`;
	if (bytes >= kb && bytes % kb === 0) return `${bytes / kb}kb`;
	return `${bytes}b`;
}

// Validate size string format (using new error return)
const validateSizeFormat = (value, fieldName) => {
	if (!value) return { message: `${fieldName} is required.` };
	const regex = /^(\d+)\s*(gb|mb|kb|b)?$/i;
	if (!regex.test(value)) {
		return { message: `${fieldName} must be in a valid format (e.g., 100mb, 2gb, 50kb, 1024b).` };
	}
	return undefined; // Valid
};

// --- Configuration Function ---

export async function configureSystem(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the System configuration
	note(
		`Configure essential system settings for your SveltyCMS installation:
  • Site name and branding
  • Development and production hostnames
  • Security settings (JWT, password strength)
  • File upload limits and body size restrictions`,
		pc.green('System Configuration:')
	);

	// Display existing configuration (secrets hidden)
	if (privateConfigData.SITE_NAME) {
		// Check if any system config exists
		note(
			`Site Name: ${pc.cyan(privateConfigData.SITE_NAME)}\n` +
				`Dev Host: ${pc.cyan(privateConfigData.HOST_DEV)}\n` +
				`Prod Host: ${pc.cyan(privateConfigData.HOST_PROD)}\n` +
				`Password Length: ${pc.cyan(privateConfigData.PASSWORD_LENGTH?.toString())}\n` +
				`Body Size Limit: ${pc.cyan(formatBytesToSize(privateConfigData.BODY_SIZE_LIMIT) || 'Not set')}\n` +
				`Max File Size: ${pc.cyan(formatBytesToSize(privateConfigData.MAX_FILE_SIZE) || 'Not set')}\n` +
				`Enable Data Extraction?: ${pc.cyan(privateConfigData.EXTRACT_DATA_PATH ? 'Yes' : 'No')}\n` + // Adjusted display
				`Log Levels: ${pc.cyan(privateConfigData.LOG_LEVELS ? privateConfigData.LOG_LEVELS.join(', ') : 'Not set')}\n` +
				`Log Retention Days: ${pc.cyan(privateConfigData.LOG_RETENTION_DAYS?.toString() || 'Not set')}\n` + // New display
				`Log Rotation Size: ${pc.cyan(formatBytesToSize(privateConfigData.LOG_ROTATION_SIZE) || 'Not set')}\n` + // New display
				`Session Cleanup Interval (ms): ${pc.cyan(privateConfigData.SESSION_CLEANUP_INTERVAL)}\n` +
				`Max In-Memory Sessions: ${pc.cyan(privateConfigData.MAX_IN_MEMORY_SESSIONS)}\n` +
				`DB Validation Probability: ${pc.cyan(privateConfigData.DB_VALIDATION_PROBABILITY)}\n` +
				`Session Expiration (s): ${pc.cyan(privateConfigData.SESSION_EXPIRATION_SECONDS)}\n` +
				`Enable Seasons: ${pc.cyan(privateConfigData.SEASONS ? 'Yes' : 'No')}\n` +
				`Seasons Region: ${pc.cyan(privateConfigData.SEASONS_REGION || 'Not set')}`,
			//`JWT_SECRET_KEY: ${pc.red(privateConfigData.JWT_SECRET)}`, // Keep secret hidden
			pc.cyan('Existing System Configuration (JWT Secret hidden):')
		);
	}

	const SITE_NAME = await text({
		message: 'Enter the site name:',
		placeholder: 'SveltyCMS',
		initialValue: privateConfigData.SITE_NAME || 'SveltyCMS',
		validate(value) {
			if (!value || value.length === 0) return { message: `Site name is required!` };
			return undefined;
		}
	});
	if (isCancel(SITE_NAME)) {
		cancelToMainMenu();
		return;
	}

	const HOST_DEV = await text({
		message: 'Enter the hostname for development:',
		placeholder: 'http://localhost:5173',
		initialValue: privateConfigData.HOST_DEV || 'http://localhost:5173',
		validate(value) {
			if (!value || value.length === 0) return { message: `Hostname is required!` };
			// Optional: Add URL validation
			return undefined;
		}
	});
	if (isCancel(HOST_DEV)) {
		cancelToMainMenu();
		return;
	}

	const HOST_PROD = await text({
		message: 'Enter the Domain name for production:',
		placeholder: 'https://yourdomain.com',
		initialValue: privateConfigData.HOST_PROD || 'https://sveltycms.com',
		validate(value) {
			if (!value || value.length === 0) return { message: `Domain name is required!` };
			// Optional: Add URL validation
			return undefined;
		}
	});
	if (isCancel(HOST_PROD)) {
		cancelToMainMenu();
		return;
	}

	const PASSWORD_LENGTH = await text({
		message: 'Enter the minimum password length (default: 8):',
		placeholder: '3',
		initialValue: privateConfigData.PASSWORD_LENGTH?.toString() || '8',
		validate: (value) => {
			const error = validatePositiveInteger(value, 'Password strength');
			return error ? error : undefined; // Return error object or undefined
		}
	});
	if (isCancel(PASSWORD_LENGTH)) {
		cancelToMainMenu();
		return;
	}

	const MAX_FILE_SIZE_STRING = await text({
		message: 'Enter the maximum upload file size (e.g., 10mb, 2gb, default: 100mb):',
		placeholder: '100mb',
		initialValue: formatBytesToSize(privateConfigData.MAX_FILE_SIZE) || '100mb',
		validate: (value) => {
			const error = validateSizeFormat(value, 'Max file size');
			return error ? error : undefined; // Return error object or undefined
		}
	});
	if (isCancel(MAX_FILE_SIZE_STRING)) {
		cancelToMainMenu();
		return;
	}
	const MAX_FILE_SIZE = parseSizeToBytes(MAX_FILE_SIZE_STRING);

	const BODY_SIZE_LIMIT_STRING = await text({
		message: 'Enter the maximum request body size limit (e.g., 1mb, 500kb, default: 1mb):',
		placeholder: '1mb',
		initialValue: formatBytesToSize(privateConfigData.BODY_SIZE_LIMIT) || '1mb',
		validate: (value) => {
			const error = validateSizeFormat(value, 'Body size limit');
			return error ? error : undefined; // Return error object or undefined
		}
	});
	if (isCancel(BODY_SIZE_LIMIT_STRING)) {
		cancelToMainMenu();
		return;
	}
	const BODY_SIZE_LIMIT = parseSizeToBytes(BODY_SIZE_LIMIT_STRING);

	const EXTRACT_DATA_PATH = await confirm({
		message: 'Enable data extraction feature?', // Rephrased prompt
		initialValue: privateConfigData.EXTRACT_DATA_PATH || false // Assuming boolean
	});
	if (isCancel(EXTRACT_DATA_PATH)) {
		cancelToMainMenu();
		return;
	}

	// Prompt for log levels using multiselect
	const LOG_LEVELS = await multiselect({
		message: 'Select log levels to be outputted:',
		options: [
			{ value: 'fatal', label: 'Fatal' }, // Added fatal
			{ value: 'error', label: 'Error' },
			{ value: 'warn', label: 'Warn' },
			{ value: 'info', label: 'Info' },
			{ value: 'debug', label: 'Debug' },
			{ value: 'trace', label: 'Trace' }, // Added trace
			{ value: 'none', label: 'None' }
		],
		initialValues: privateConfigData.LOG_LEVELS || ['info', 'warn', 'error'], // Sensible defaults
		validate(value) {
			if (value.length === 0) return { message: 'At least one log level must be selected (choose "none" to disable).' };
			if (value.includes('none') && value.length > 1) return { message: 'Cannot select "None" with other log levels.' };
			return undefined;
		}
	});
	if (isCancel(LOG_LEVELS)) {
		cancelToMainMenu();
		return;
	}

	// New: Prompt for log retention days
	const LOG_RETENTION_DAYS = await text({
		message: 'Enter log retention period (days, default: 2):',
		placeholder: '2',
		initialValue: privateConfigData.LOG_RETENTION_DAYS?.toString() || '2',
		validate: (value) => {
			const error = validatePositiveInteger(value, 'Log retention days');
			return error ? error : undefined;
		}
	});
	if (isCancel(LOG_RETENTION_DAYS)) {
		cancelToMainMenu();
		return;
	}

	// New: Prompt for log rotation size
	const LOG_ROTATION_SIZE_STRING = await text({
		message: 'Enter log file rotation size (e.g., 5mb, 1gb, default: 5mb):',
		placeholder: '5mb',
		initialValue: formatBytesToSize(privateConfigData.LOG_ROTATION_SIZE) || '5mb',
		validate: (value) => {
			const error = validateSizeFormat(value, 'Log rotation size');
			return error ? error : undefined;
		}
	});
	if (isCancel(LOG_ROTATION_SIZE_STRING)) {
		cancelToMainMenu();
		return;
	}
	const LOG_ROTATION_SIZE = parseSizeToBytes(LOG_ROTATION_SIZE_STRING);

	const SESSION_CLEANUP_INTERVAL = await text({
		message: 'Enter session cleanup interval (ms, default: 60000):',
		placeholder: '60000',
		initialValue: privateConfigData.SESSION_CLEANUP_INTERVAL?.toString() || '60000',
		validate: (value) => {
			const error = validatePositiveInteger(value, 'Session cleanup interval');
			return error ? error : undefined;
		}
	});
	if (isCancel(SESSION_CLEANUP_INTERVAL)) {
		cancelToMainMenu();
		return;
	}

	const MAX_IN_MEMORY_SESSIONS = await text({
		message: 'Enter max in-memory sessions (default: 10000):',
		placeholder: '10000',
		initialValue: privateConfigData.MAX_IN_MEMORY_SESSIONS?.toString() || '10000',
		validate: (value) => {
			const error = validatePositiveInteger(value, 'Max in-memory sessions');
			return error ? error : undefined;
		}
	});
	if (isCancel(MAX_IN_MEMORY_SESSIONS)) {
		cancelToMainMenu();
		return;
	}

	const DB_VALIDATION_PROBABILITY = await text({
		message: 'Enter DB validation probability (0-1, default: 0.1):',
		placeholder: '0.1',
		initialValue: privateConfigData.DB_VALIDATION_PROBABILITY?.toString() || '0.1',
		validate: (value) => {
			const error = validateProbability(value, 'DB validation probability');
			return error ? error : undefined;
		}
	});
	if (isCancel(DB_VALIDATION_PROBABILITY)) {
		cancelToMainMenu();
		return;
	}

	const SESSION_EXPIRATION_SECONDS = await text({
		message: 'Enter session expiration time (seconds, default: 3600):',
		placeholder: '3600',
		initialValue: privateConfigData.SESSION_EXPIRATION_SECONDS?.toString() || '3600',
		validate: (value) => {
			const error = validatePositiveInteger(value, 'Session expiration');
			return error ? error : undefined;
		}
	});
	if (isCancel(SESSION_EXPIRATION_SECONDS)) {
		cancelToMainMenu();
		return;
	}

	const SEASONS = await confirm({
		message: 'Enable seasonal themes/features?',
		initialValue: privateConfigData.SEASONS || false
	});
	if (isCancel(SEASONS)) {
		cancelToMainMenu();
		return;
	}

	let SEASONS_REGION;
	if (SEASONS) {
		SEASONS_REGION = await select({
			message: 'Select a region for seasonal content:',
			options: [
				{
					value: 'Western_Europe',
					label: 'Western Europe',
					hint: 'New Year, Easter, Halloween, Christmas'
				},
				{ value: 'South_Asia', label: 'South Asia', hint: 'Diwali' },
				{ value: 'East_Asia', label: 'East Asia', hint: 'Chinese New Year' }
			],
			initialValue: privateConfigData.SEASONS_REGION || 'Western_Europe'
		});
		if (isCancel(SEASONS_REGION)) {
			cancelToMainMenu();
			return;
		}
	}

	// Generate secret once if needed, use existing otherwise
	const existingJwtSecret = privateConfigData.JWT_SECRET_KEY;
	const generatedJwtSecret = existingJwtSecret || generateRandomJWTSecret();

	const JWT_SECRET_KEY = await password({
		message: 'Enter JWT secret key (used for signing tokens):',
		initialValue: generatedJwtSecret, // Use existing or newly generated
		validate(value) {
			if (!value) return { message: `JWT secret key is required!` };
			if (value.length < 32) return { message: `JWT secret should be at least 32 characters long for security.` };
			return undefined;
		}
	});
	if (isCancel(JWT_SECRET_KEY)) {
		cancelToMainMenu();
		return;
	}

	// Summary (Secret hidden)
	note(
		`Site Name: ${pc.green(SITE_NAME)}\n` +
			`Dev Host: ${pc.green(HOST_DEV)}\n` +
			`Prod Host: ${pc.green(HOST_PROD)}\n` +
			`Password Length: ${pc.green(PASSWORD_LENGTH)}\n` +
			`Body Size Limit: ${pc.green(formatBytesToSize(BODY_SIZE_LIMIT) || 'Not set')}\n` +
			`Max File Size: ${pc.green(formatBytesToSize(MAX_FILE_SIZE) || 'Not set')}\n` +
			`Enable Data Extraction?: ${pc.green(EXTRACT_DATA_PATH ? 'Yes' : 'No')}\n` +
			`Log Levels: ${pc.green(LOG_LEVELS.join(', '))}\n` +
			`Log Retention Days: ${pc.green(LOG_RETENTION_DAYS)}\n` + // New summary line
			`Log Rotation Size: ${pc.green(formatBytesToSize(LOG_ROTATION_SIZE))}\n` + // New summary line
			`Session Cleanup Interval (ms): ${pc.green(SESSION_CLEANUP_INTERVAL)}\n` +
			`Max In-Memory Sessions: ${pc.green(MAX_IN_MEMORY_SESSIONS)}\n` +
			`DB Validation Probability: ${pc.green(DB_VALIDATION_PROBABILITY)}\n` +
			`Session Expiration (s): ${pc.green(SESSION_EXPIRATION_SECONDS)}\n` +
			`Enable Seasons: ${pc.green(SEASONS ? 'Yes' : 'No')}\n` +
			`Seasons Region: ${pc.green(SEASONS && SEASONS_REGION ? SEASONS_REGION : 'Not Applicable')}\n` +
			`JWT Secret Key: ${pc.green('[Set]')}`, // Keep secret hidden
		pc.green('Review Your System Configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this system configuration?',
		initialValue: true
	});

	if (isCancel(confirmSave)) {
		cancelToMainMenu();
		return;
	}

	if (!confirmSave) {
		note('Configuration not saved.', pc.yellow('Action Cancelled'));
		cancelToMainMenu(); // Return to main config menu
		return;
	}
	// If confirmed, proceed to return the config object
	// Compile and return the configuration data, ensuring numeric types
	return {
		SITE_NAME,
		HOST_DEV,
		HOST_PROD,
		PASSWORD_LENGTH: Number(PASSWORD_LENGTH),
		BODY_SIZE_LIMIT, // Already in bytes
		MAX_FILE_SIZE, // Already in bytes
		EXTRACT_DATA_PATH,
		LOG_LEVELS,
		LOG_RETENTION_DAYS: Number(LOG_RETENTION_DAYS), // New: Pass as number
		LOG_ROTATION_SIZE, // New: Pass as bytes
		SESSION_CLEANUP_INTERVAL: Number(SESSION_CLEANUP_INTERVAL),
		MAX_IN_MEMORY_SESSIONS: Number(MAX_IN_MEMORY_SESSIONS),
		DB_VALIDATION_PROBABILITY: Number(DB_VALIDATION_PROBABILITY),
		SESSION_EXPIRATION_SECONDS: Number(SESSION_EXPIRATION_SECONDS),
		SEASONS,
		SEASONS_REGION: SEASONS ? SEASONS_REGION : undefined, // Only set region if seasons enabled
		JWT_SECRET_KEY
	};
}
