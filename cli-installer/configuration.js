import { isCancel, select } from '@clack/prompts';
import pc from 'picocolors';

import { Title, cancelOperation } from './cli-installer.js';
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

	// Switch based on user selection
	switch (projectConfigure) {
		case 'Database':
			return await configureDatabase();
		case 'Email':
			return await configureEmail();
		case 'Language':
			return await configureLanguage();
		case 'System':
			return await configureSystem();
		case 'Media':
			return await configureMedia();
		case 'Google':
			return await configureGoogle();
		case 'Redis':
			return await configureRedis();
		case 'Mapbox':
			return await configureMapbox();
		case 'Tiktok':
			return await configureTiktok(); // Corrected function call
		case 'OpenAI':
			return await configureOpenAI(); // Assuming there's a configureOpenAI function
		default:
			console.error('Unexpected selection:', projectConfigure);
			return null;
	}
};
