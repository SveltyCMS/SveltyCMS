import { confirm, text, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureSystem() {
	// SveltyCMS Title
	Title();

	const SITE_NAME = await text({
		message: 'Enter the site name:',
		placeholder: 'SveltyCMS',
		initialValue: 'SveltyCMS',
		validate(value) {
			if (value.length === 0) return `Site name is required!`;
		}
	});

	const HOST_DEV = await text({
		message: 'Enter the hostname for development:',
		placeholder: 'http://localhost:5173',
		initialValue: 'http://localhost:5173',
		validate(value) {
			if (value.length === 0) return `Hostname is required!`;
		}
	});

	const HOST_PROD = await text({
		message: 'Enter the Domain name for production:',
		placeholder: 'https://yourdomain.com',
		initialValue: 'https://sveltycms.com',
		validate(value) {
			if (value.length === 0) return `Domain name is required!`;
		}
	});

	const PASSWORD_STRENGTH = await text({
		message: 'Enter the password strength (default: 8):',
		placeholder: '8',
		initialValue: '8',
		validate(value) {
			if (value.length === 0) return `Password strength is required!`;
			// if (value.length < 4 ) return `Password strength to low`;
		}
	});

	const BODY_SIZE_LIMIT = await text({
		message: 'Enter the body size limit (default: 100mb):',
		placeholder: '100mb',
		initialValue: '100mb',
		validate(value) {
			const regex = /^(\d+)(mb|kb|gb|b)$/i;
			if (!regex.test(value)) {
				return 'Please enter a valid size format (e.g., 100mb, 2gb, 50kb).';
			}
		}
	});

	const SEASONS = await confirm({
		message: 'Do you want to enable seasons?',
		initialValue: false
	});

	let SEASONS_REGION;
	if (SEASONS) {
		SEASONS_REGION = await text({
			message: 'Pick a Region type.',
			placeholder: 'Europe',
			initialValue: 'Europe'
		});
	}

	// Summary
	note(
		`SITE_NAME: ${pc.green(SITE_NAME)}\n` +
			`HOST_DEV: ${pc.green(HOST_DEV)}\n` +
			`HOST_PROD: ${pc.green(HOST_PROD)}\n` +
			`PASSWORD_STRENGTH: ${pc.green(PASSWORD_STRENGTH)}\n` +
			`BODY_SIZE_LIMIT: ${pc.green(BODY_SIZE_LIMIT)}\n` +
			`SEASONS:${pc.green(SEASONS)}\n` +
			`SEASONS_REGION: ${pc.green(SEASONS && SEASONS_REGION ? SEASONS_REGION : 'Not enabled')}`,
		pc.green('Review your System configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

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

		if (restartOrExit === 'restart') {
			return configureSystem();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	return { SITE_NAME, HOST_DEV, HOST_PROD, PASSWORD_STRENGTH, BODY_SIZE_LIMIT, SEASONS, SEASONS_REGION };
}
