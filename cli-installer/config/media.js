/** 
@file cli-installer/config/media.js
@description Configuration prompts for the Media section

### Features
- Displays a note about the Media configuration
- Displays existing configuration (password hidden)
- Prompts for Media integration
*/

import { confirm, isCancel, note, select, text } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

// Helper function to parse IMAGE_SIZES string
function parseImageSizes(sizesString) {
	if (!sizesString || typeof sizesString !== 'string' || sizesString.trim() === '') {
		return {}; // Return empty object if blank or invalid
	}
	const sizes = {};
	try {
		sizesString.split(',').forEach((pair) => {
			const [key, value] = pair.split(':').map((s) => s.trim());
			if (key && value && !isNaN(parseInt(value, 10))) {
				sizes[key] = parseInt(value, 10);
			} else {
				// Throw error if format is incorrect for any pair
				throw new Error(`Invalid format in pair: "${pair.trim()}"`);
			}
		});
		return sizes;
	} catch (error) {
		console.error('Error parsing IMAGE_SIZES:', error.message);
		// Return null or throw error to indicate parsing failure for validation
		return null;
	}
}

// Helper function to format IMAGE_SIZES object to string for display/initial value
function formatImageSizes(sizesObject) {
	if (!sizesObject || typeof sizesObject !== 'object' || Object.keys(sizesObject).length === 0) {
		return '';
	}
	return Object.entries(sizesObject)
		.map(([key, value]) => `${key}: ${value}`)
		.join(', ');
}

export async function configureMedia(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the Media configuration
	note(
		`Configure media handling and optimization:
  • Image processing sizes and formats
  • Media storage folder location
  • Image quality and optimization settings
  • Media server URL for external hosting`,
		pc.green('Media Configuration:')
	);

	// Display existing configuration
	if (privateConfigData.MEDIA_FOLDER) {
		// Check if any media config exists
		note(
			`Image Sizes: ${pc.cyan(formatImageSizes(privateConfigData.IMAGE_SIZES) || 'Not set')}\n` +
				`Media Folder: ${pc.cyan(privateConfigData.MEDIA_FOLDER || 'Not set')}\n` +
				`Output Format: ${pc.cyan(privateConfigData.MEDIA_OUTPUT_FORMAT_QUALITY?.format || 'Not set')}\n` +
				`Output Quality: ${pc.cyan(privateConfigData.MEDIA_OUTPUT_FORMAT_QUALITY?.quality?.toString() || 'Not set')}\n` +
				`Media Server URL: ${pc.cyan(privateConfigData.MEDIASERVER_URL || 'Not set / Localhost')}`,
			pc.cyan('Existing Media Configuration:')
		);
	}

	// Media configuration
	const imageSizesString = await text({
		message: "Enter image sizes as 'key: value' pairs, comma-separated (e.g., sm: 600, md: 900), or leave blank:",
		placeholder: 'sm: 600, md: 900, lg: 1200',
		initialValue: formatImageSizes(privateConfigData.IMAGE_SIZES) || '',
		validate(value) {
			if (value.trim() === '') return undefined; // Allow blank input
			const parsed = parseImageSizes(value);
			if (parsed === null) {
				// Check for parsing error indication
				return {
					message: 'Invalid format. Use "key: value, key: value" (e.g., sm: 600, md: 900). Ensure keys are strings and values are numbers.'
				};
			}
			return undefined; // Valid
		}
	});
	if (isCancel(imageSizesString)) {
		cancelToMainMenu();
		return;
	}
	const IMAGE_SIZES = parseImageSizes(imageSizesString); // Parse the validated string

	const MEDIA_FOLDER = await text({
		message: "Enter the folder where the site's media files will be stored:",
		placeholder: 'mediaFiles',
		initialValue: privateConfigData.MEDIA_FOLDER || 'mediaFiles'
	});
	if (isCancel(MEDIA_FOLDER)) {
		cancelToMainMenu();
		return;
	}

	const MEDIA_OUTPUT_FORMAT_QUALITY = {
		format: await select({
			message: 'Choose the media output format for Images optimization:',
			options: [
				{
					value: 'original',
					label: 'Original quality',
					hint: 'No Optimization, Media will only be resized'
				},
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
				if (value === null || value === undefined || value === '') return { message: `Quality value is required.` };
				const num = Number(value);
				if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 100) {
					return { message: `Quality must be an integer between 0 and 100.` };
				}
				return undefined; // Valid
			}
		})
	};
	if (isCancel(MEDIA_OUTPUT_FORMAT_QUALITY.format)) {
		cancelToMainMenu();
		return;
	}
	if (isCancel(MEDIA_OUTPUT_FORMAT_QUALITY.quality)) {
		cancelToMainMenu();
		return;
	}
	// Convert quality to number after validation
	MEDIA_OUTPUT_FORMAT_QUALITY.quality = parseInt(MEDIA_OUTPUT_FORMAT_QUALITY.quality, 10);

	const MEDIASERVER_URL = await text({
		message: 'Enter the URL of the media server, or leave blank for localhost:',
		placeholder: 'localhost',
		initialValue: privateConfigData.MEDIASERVER_URL || '',
		validate() {
			// Removed unused parameter
			// Optional: Add basic URL validation if desired
			// if (value && !value.startsWith('http://') && !value.startsWith('https://')) return 'Please enter a valid URL (starting with http:// or https://) or leave blank.';
		}
	});
	if (isCancel(MEDIASERVER_URL)) {
		cancelToMainMenu();
		return;
	}

	// Summary
	note(
		`Image Sizes: ${pc.green(formatImageSizes(IMAGE_SIZES) || 'Not Set')}\n` +
			`Media Folder: ${pc.green(MEDIA_FOLDER || 'mediaFiles')}\n` + // Show default if blank
			`Output Format: ${pc.green(MEDIA_OUTPUT_FORMAT_QUALITY.format)}\n` +
			`Output Quality: ${pc.green(MEDIA_OUTPUT_FORMAT_QUALITY.quality)}\n` +
			`Media Server URL: ${pc.green(MEDIASERVER_URL || 'Not Set / Localhost')}`,
		pc.green('Review Your Media Configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this media configuration?',
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

	// Compile and return the configuration data
	return {
		IMAGE_SIZES,
		MEDIA_FOLDER,
		MEDIA_OUTPUT_FORMAT_QUALITY,
		MEDIASERVER_URL
	};
}
