import { confirm, text, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureMedia() {
	// SvelteCMS Title
	Title();

	// Configuration Title
	console.log(pc.blue('◆  Media Configuration:'));

	// Media configuration
	const IMAGE_SIZES = await text({
		message: "Enter the image sizes in format 'size: value', separated by commas (e.g., sm: 600, md: 900, lg: 1200), or leave blank:",
		placeholder: 'sm: 600, md: 900, lg: 1200',
		initialValue: ''
	});

	const MEDIA_FOLDER = await text({
		message: "Enter the folder where the site's media files will be stored:",
		placeholder: 'mediaFiles',
		initialValue: 'mediaFiles',
		required: false
	});

	const MEDIA_OUTPUT_FORMAT_QUALITY = {
		format: await select({
			message: 'Choose the media output format for Images optimization:',
			options: [
				{ value: 'original', label: 'Original quality', hint: 'No Optimization, Media will only be resized' },
				{ value: 'avif', label: 'AVIF', hint: 'Best Compression, recommended' },
				{ value: 'webp', label: 'WebP', hint: 'Great Compression, recommended as widely supported' }
			],
			initialValue: 'original',
			required: true
		}),
		quality: await text({
			message: 'Enter the media output quality between 0 and 100, bigger is higher quality, but larger file size:',
			placeholder: '80',
			initialValue: '80',
			validate(value) {
				if (value.length === 0) return `Please enter a valid Media Output Quality between 0 and 100.`;
			}
		})
	};

	const MEDIASERVER_URL = await text({
		message: 'Enter the URL of the media server, or leave blank for localhost:',
		placeholder: 'localhost',
		initialValue: ''
	});

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
