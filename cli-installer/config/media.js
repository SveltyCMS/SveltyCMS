import { confirm, text, note, select, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

export async function configureMedia(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the Media configuration
	note(
		`The Media configuration allows you to set the sizes for image\n` +
			`processing, the folder for storing media files, the output\n` +
			`format and quality for image optimization,\n` +
			`and the media server URL.`,
		pc.green('Media Configuration:')
	);

	// Display existing configuration
	note(
		`IMAGE_SIZES: ${pc.red(JSON.stringify(privateConfigData.IMAGE_SIZES).replaceAll('{', '').replaceAll('}', '').replaceAll('"', ''))}\n` +
			`MEDIA_FOLDER: ${pc.red(privateConfigData.MEDIA_FOLDER)}\n` +
			`MEDIA_OUTPUT_FORMAT_QUALITY: ${pc.red(JSON.stringify(privateConfigData.MEDIA_OUTPUT_FORMAT_QUALITY))}\n` +
			`MEDIASERVER_URL: ${pc.red(privateConfigData.MEDIASERVER_URL)}`,
		pc.red('Existing Media Configuration:')
	);

	// Media configuration
	const IMAGE_SIZES = await text({
		message: "Enter the image sizes in format 'size: value', separated by commas (e.g., sm: 600, md: 900, lg: 1200), or leave blank:",
		placeholder: 'sm: 600, md: 900, lg: 1200',
		initialValue: JSON.stringify(privateConfigData.IMAGE_SIZES).replaceAll('{', '').replaceAll('}', '').replaceAll('"', '') || ''
	});

	if (isCancel(IMAGE_SIZES)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const MEDIA_FOLDER = await text({
		message: "Enter the folder where the site's media files will be stored:",
		placeholder: 'mediaFiles',
		initialValue: privateConfigData.MEDIA_FOLDER || 'mediaFiles',
		required: false
	});

	if (isCancel(MEDIA_FOLDER)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const MEDIA_OUTPUT_FORMAT_QUALITY = {
		format: await select({
			message: 'Choose the media output format for Images optimization:',
			options: [
				{ value: 'original', label: 'Original quality', hint: 'No Optimization, Media will only be resized' },
				{ value: 'avif', label: 'AVIF', hint: 'Best Compression, recommended' },
				{ value: 'webp', label: 'WebP', hint: 'Great Compression, recommended as widely supported' }
			],
			initialValue: privateConfigData.MEDIA_OUTPUT_FORMAT_QUALITY?.format || 'original',
			required: true
		}),
		quality: await text({
			message: 'Enter the media output quality between 0 and 100, bigger is higher quality, but larger file size:',
			placeholder: '80',
			initialValue: privateConfigData.MEDIA_OUTPUT_FORMAT_QUALITY?.quality?.toString() || '80',
			validate(value) {
				if (value.length === 0) return `Please enter a valid Media Output Quality between 0 and 100.`;
			}
		})
	};

	if (isCancel(MEDIA_OUTPUT_FORMAT_QUALITY.format) || isCancel(MEDIA_OUTPUT_FORMAT_QUALITY.quality)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	const MEDIASERVER_URL = await text({
		message: 'Enter the URL of the media server, or leave blank for localhost:',
		placeholder: 'localhost',
		initialValue: privateConfigData.MEDIASERVER_URL || ''
	});

	if (isCancel(MEDIASERVER_URL)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Summary
	note(
		`IMAGE_SIZES: ${pc.green(IMAGE_SIZES || '')}\n` +
			`MEDIA_FOLDER: ${pc.green(MEDIA_FOLDER)}\n` +
			`MEDIA_OUTPUT_FORMAT_QUALITY: ${pc.green(JSON.stringify(MEDIA_OUTPUT_FORMAT_QUALITY))}\n` +
			`MEDIASERVER_URL: ${pc.green(MEDIASERVER_URL || '')}`,
		pc.green('Review your Media configuration:')
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
		console.log('Media configuration canceled.');
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
			return configureMedia();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Compile and return the configuration data
	return {
		IMAGE_SIZES,
		MEDIA_FOLDER,
		MEDIA_OUTPUT_FORMAT_QUALITY,
		MEDIASERVER_URL
	};
}
