import { isCancel, select, confirm } from '@clack/prompts';
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

	// Initialize an object to store all the configuration data
	const configData = {};

	let projectConfigure;
	let exitConfirmed = false;

	do {
		// Configure SvelteCMS
		projectConfigure = await select({
			message: 'Configure SvelteCMS - Pick a Category (* Required)',
			options: [
				{ value: 'Database', label: pc[configData.database ? 'green' : 'white']('Database *'), hint: 'Configure Database', required: true },
				{ value: 'Email', label: pc[configData.email ? 'green' : 'white']('Email *'), hint: 'Configure Email Server', required: true },
				{ value: 'Language', label: pc[configData.language ? 'green' : 'white']('Language'), hint: 'Configure System & Content Languages' },
				{ value: 'System', label: pc[configData.system ? 'green' : 'white']('System'), hint: 'Configure System settings' },
				{ value: 'Media', label: pc[configData.media ? 'green' : 'white']('Media'), hint: 'Configure Media handling' },
				{ value: 'Google', label: pc[configData.google ? 'green' : 'white']('Google'), hint: 'Configure Google API' },
				{ value: 'Redis', label: pc[configData.redis ? 'green' : 'white']('Redis'), hint: 'Configure Redis cache' },
				{ value: 'Mapbox', label: pc[configData.mapbox ? 'green' : 'white']('Mapbox'), hint: 'Configure Mapbox API' },
				{ value: 'Tiktok', label: pc[configData.tiktok ? 'green' : 'white']('Tiktok'), hint: 'Configure Tiktok API' },
				{ value: 'OpenAI', label: pc[configData.openai ? 'green' : 'white']('OpenAI'), hint: 'Define OpenAI API' },
				{ value: 'Exit', label: 'Exit', hint: 'Exit the installer' }
			]
		});

		if (isCancel(projectConfigure)) {
			cancelOperation();
		}

		switch (projectConfigure) {
			case 'Database': {
				configData.database = await configureDatabase();
				break;
			}
			case 'Email': {
				configData.email = await configureEmail();
				break;
			}
			case 'Language': {
				configData.language = await configureLanguage();
				break;
			}
			case 'System': {
				configData.system = await configureSystem();
				break;
			}
			case 'Media': {
				configData.media = await configureMedia();
				break;
			}
			case 'Google': {
				configData.google = await configureGoogle();
				break;
			}
			case 'Redis': {
				configData.redis = await configureRedis();
				break;
			}
			case 'Mapbox': {
				configData.mapbox = await configureMapbox();
				break;
			}
			case 'Tiktok': {
				configData.tiktok = await configureTiktok();
				break;
			}
			case 'OpenAI': {
				configData.openai = await configureOpenAI();
				break;
			}
			case 'Exit': {
				const confirmExit = await confirm({
					message: 'Are you sure you want to exit?',
					initial: false
				});
				if (confirmExit) {
					exitConfirmed = true;
				}
				console.clear();
				break;
			}
			default:
				console.error('Unexpected selection:', projectConfigure);
				return null;
		}
	} while (!exitConfirmed);

	if (configData.database && configData.email) {
		const confirmSave = await confirm({
			message: 'Do you want to save the configuration?',
			initial: true
		});

		if (confirmSave) {
			await createOrUpdateConfigFile(configData);
			console.log('Configuration saved.');
		} else {
			console.log('Configuration not saved.');
		}
	} else {
		console.log('Configuration requires Database and Email to be set.');
	}
};
