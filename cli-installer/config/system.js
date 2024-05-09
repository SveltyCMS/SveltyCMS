import { confirm, select, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureSystem() {
	// SveltyCMS Title
	Title();

	const SITE_NAME = await select({
		message: 'Enter the site name:',
		placeholder: 'SveltyCMS',
		initialValue: 'SveltyCMS',
		validate(value) {
			if (value.length === 0) return `Site name is required!`;
		}
	});

	const HOST_DEV = await select({
		message: 'Enter the hostname for development:',
		placeholder: 'http://localhost:5173',
		initialValue: 'http://localhost:5173',
		validate(value) {
			if (value.length === 0) return `Hostname is required!`;
		}
	});

	const HOST_PROD = await select({
		message: 'Enter the Domain name for production:',
		placeholder: 'https://yourdomain.de',
		validate(value) {
			if (value.length === 0) return `Domain name is required!`;
		}
	});

	const PASSWORD_STRENGTH = await select({
		message: 'Enter the password strength (default: 8):',
		placeholder: '8',
		validate(value) {
			const strength = parseInt(value);
			if (isNaN(strength) || strength < 4) {
				return 'Password strength should be at least 4.';
			}
			return true;
		}
	});

	const BODY_SIZE_LIMIT = await select({
		message: 'Enter the body size limit (default: 100mb):',
		placeholder: '100mb',
		validate(value) {
			const regex = /^(\d+)(mb|kb|gb|b)$/i;
			if (!regex.test(value)) {
				return 'Please enter a valid size format (e.g., 100mb, 2gb, 50kb).';
			}
			return true;
		}
	});

	const SEASONS = await confirm({
		message: 'Do you want to enable seasons?',
		initial: false
	});

	let SEASONS_REGION;
	if (SEASONS) {
		SEASONS_REGION = await select({
			message: 'Pick a Region type.',
			options: [
				{ value: 'Europe', label: 'Europe', hint: 'Default' }
				// Add more options here if needed
			]
		});
	}

	// Summary
	note(
		`SITE_NAME: ${SITE_NAME}\n` +
			`HOST_DEV: ${HOST_DEV}\n` +
			`HOST_PROD: ${HOST_PROD}\n` +
			`PASSWORD_STRENGTH: ${PASSWORD_STRENGTH}\n` +
			`BODY_SIZE_LIMIT: ${BODY_SIZE_LIMIT}\n` +
			`SEASONS: ${SEASONS}\n` +
			`SEASONS_REGION: ${SEASONS_REGION ? SEASONS_REGION : 'Not enabled'}`, // Handle case where SEASONS_REGION is undefined
		pc.green('Review your System configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initial: true
	});

	if (!action) {
		console.log('System configuration canceled.');
		process.exit(0); // Exit with code 0
	}

	return { SITE_NAME, HOST_DEV, HOST_PROD, PASSWORD_STRENGTH, BODY_SIZE_LIMIT, SEASONS, SEASONS_REGION };
}
