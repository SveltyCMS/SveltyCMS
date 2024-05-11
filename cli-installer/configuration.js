import { isCancel, select, note } from '@clack/prompts';
import pc from 'picocolors';

import { Title, cancelOperation } from './cli-installer.js';
import { createOrUpdateConfigFile } from './createOrUpdateConfigFile.js';

import { configureDatabase } from './config/database.js';
import { configureEmail } from './config/email.js';
import { configureLanguage } from './config/language.js';
import { configureSystem } from './config/system.js';
import { configureMedia } from './config/media.js';
import { configureGoogle } from './config/google.js';
import { configureRedis } from './config/redis.js';
import { configureMapbox } from './config/mapbox.js';
import { configureTiktok } from './config/tiktok.js';
import { configureOpenAI } from './config/openai.js';

export const configurationPrompt = async () => {
	// SveltyCMS Title
	Title();

	// Configure SvelteCMS
	const projectConfigure = await select({
		message: 'Configure SvelteCMS - Pick a Category',
		options: [
			{ value: 'Database', label: 'Database', hint: 'Configure Database', required: true },
			{ value: 'Email', label: 'Email', hint: 'Configure Email Server', required: true },
			{ value: 'Language', label: 'Language', hint: 'Configure System & Content Languages' },
			{ value: 'System', label: 'System', hint: 'Configure System settings' },
			{ value: 'Media', label: 'Media', hint: 'Configure Media handling' },
			{ value: 'Google', label: 'Google', hint: 'Configure Google API' },
			{ value: 'Redis', label: 'Redis', hint: 'Configure Redis cache' },
			{ value: 'Mapbox', label: 'Mapbox', hint: 'Configure Mapbox API' },
			{ value: 'Tiktok', label: 'Tiktok', hint: 'Configure Tiktok API' },
			{ value: 'OpenAI', label: 'OpenAI', hint: 'Define OpenAI API' }
		]
	});

	if (isCancel(projectConfigure)) {
		cancelOperation();
	}

	// Initialize an object to store all the configuration data
	const configData = {};

	// Switch based on user selection
	switch (projectConfigure) {
		case 'Database':
			configData.database = await configureDatabase();
			break;
		case 'Email':
			configData.email = await configureEmail();
			break;
		case 'Language':
			configData.language = await configureLanguage();
			break;
		case 'System':
			configData.system = await configureSystem();
			break;
		case 'Media':
			configData.media = await configureMedia();
			break;
		case 'Google':
			configData.media = await configureGoogle();
			break;
		case 'Redis':
			configData.media = await configureRedis();
			break;
		case 'Mapbox':
			configData.media = await configureMapbox();
			break;
		case 'Tiktok':
			configData.media = await configureTiktok();
			break;
		case 'OpenAI':
			configData.media = await configureOpenAI();
			break;
		default:
			console.error('Unexpected selection:', projectConfigure);
			return null;
	}

	// Display a summary note before saving
	const summaryNote = Object.entries(configData)
		.map(([key, value]) => `${key}:\n${JSON.stringify(value, null, 2)}`)
		.join('\n\n');

	note(`${summaryNote}`, pc.green('Review your configuration:'));

	const confirmSave = await select({
		message: 'Do you want to save the configuration?',
		options: [
			{ value: 'yes', label: 'Yes' },
			{ value: 'no', label: 'No' }
		]
	});

	if (confirmSave === 'yes') {
		// Call the createOrUpdateConfigFile function with the collected data
		await createOrUpdateConfigFile(configData);
	} else {
		console.log('Configuration not saved.');
	}
};
