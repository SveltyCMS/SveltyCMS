import { isCancel, select, confirm, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { importSingleTs } from 'import-single-ts';

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

const REQUIRED_FIELDS = {
	database: 'DB_HOST',
	email: 'SMTP_HOST'
};

const CONFIG_PATHS = {
	private: path.join(process.cwd(), 'config', 'private.ts'),
	public: path.join(process.cwd(), 'config', 'public.ts')
};

const OPTIONS = [
	{ value: 'Database', label: 'Database *', hint: 'Configure Database', required: true },
	{ value: 'Email', label: 'Email *', hint: 'Configure Email Server', required: true },
	{ value: 'Language', label: 'Language', hint: 'Configure System & Content Languages' },
	{ value: 'System', label: 'System', hint: 'Configure System settings' },
	{ value: 'Media', label: 'Media', hint: 'Configure Media handling' },
	{ value: 'Google', label: 'Google', hint: 'Configure Google API' },
	{ value: 'Redis', label: 'Redis', hint: 'Configure Redis cache' },
	{ value: 'Mapbox', label: 'Mapbox', hint: 'Configure Mapbox API' },
	{ value: 'Tiktok', label: 'Tiktok', hint: 'Configure Tiktok API' },
	{ value: 'OpenAI', label: 'OpenAI', hint: 'Define OpenAI API' },
	{ value: 'Exit', label: 'Save & Exit', hint: 'Save & Exit the installer' }
];

// Helper function to dynamically import TypeScript modules
async function importTSModule(filePath) {
	const tsCode = fs.readFileSync(filePath, 'utf-8');
	const { outputText: jsCode } = ts.transpileModule(tsCode, {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ESNext
		}
	});

	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
	const requireMock = (module) => {
		const registeredModules = {
			fs,
			path,
			'./types': importSingleTs(path.join(process.cwd(), 'config', 'types.ts'))
		};
		if (!registeredModules[module]) {
			throw new Error(`Cannot find module '${module}'`);
		}
		return registeredModules[module];
	};

	const moduleExports = {};
	const moduleWrapper = new AsyncFunction('exports', 'require', jsCode);
	await moduleWrapper(moduleExports, requireMock);

	return moduleExports.default || moduleExports;
}

async function importConfig(filePath) {
	try {
		if (fs.existsSync(filePath)) {
			return await importTSModule(filePath);
		}
		// else {
		// 	console.log(`Configuration file not found: ${filePath}`);
		// }
	} catch (error) {
		console.error(`Error importing configuration file: ${error.message}`);
	}
	return {};
}

function hasRequiredFields(configData) {
	return Object.values(REQUIRED_FIELDS).every((field) => !!configData[field]);
}

function updateConfigData(configData, newConfig) {
	return { ...configData, ...newConfig };
}

async function handleExit(configData) {
	if (!hasRequiredFields(configData)) {
		const confirmExit = await confirm({
			message: 'Database and Email are required to save the configuration. Do you still want to exit without saving?',
			initialValue: false
		});
		if (confirmExit) {
			outro('Thank you for using SveltyCMS CLI Installer.');
			process.exit(0);
		}
	} else {
		const confirmSave = await confirm({
			message: 'Do you want to save the configuration before exiting?',
			initialValue: true
		});
		if (confirmSave) {
			try {
				await createOrUpdateConfigFile(configData);
				console.log('Configuration saved.');
			} catch (error) {
				console.error('Error saving configuration:', error);
			}
		} else {
			console.log('Configuration not saved.');
		}
		outro('Thank you for using SveltyCMS CLI Installer.');
		process.exit(0);
	}
}

export const configurationPrompt = async () => {
	Title();
	note(
		`${pc.green('Database')} and ${pc.green('Email')} configurations are required. Other configurations are optional.`,
		pc.green('Configuration Instructions:')
	);

	let configData = {};
	const privateConfig = await importConfig(CONFIG_PATHS.private);
	const publicConfig = await importConfig(CONFIG_PATHS.public);

	configData = { ...configData, ...privateConfig?.privateEnv, ...publicConfig?.publicEnv };

	let exitConfirmed = false;
	do {
		const selectedOption = await select({
			message: 'Configure SveltyCMS - Pick a Category (* Required)',
			options: OPTIONS.map((option) => ({
				...option,
				label: configData[REQUIRED_FIELDS[option.value.toLowerCase()]] ? pc.green(option.label) : option.label
			}))
		});

		if (isCancel(selectedOption)) {
			await cancelOperation();
			return;
		}

		if (selectedOption === 'Exit') {
			await handleExit(configData);
			exitConfirmed = true;
		} else {
			try {
				const configureFunction = {
					Database: configureDatabase,
					Email: configureEmail,
					Language: configureLanguage,
					System: configureSystem,
					Media: configureMedia,
					Google: configureGoogle,
					Redis: configureRedis,
					Mapbox: configureMapbox,
					Tiktok: configureTiktok,
					OpenAI: configureOpenAI
				}[selectedOption];

				const result = await configureFunction(configData);
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData = updateConfigData(configData, result);
			} catch (error) {
				console.error(`Error configuring ${selectedOption}: ${error.message}`);
			}
		}
	} while (!exitConfirmed);

	if (hasRequiredFields(configData)) {
		const confirmSave = await confirm({
			message: 'Do you want to save the configuration?',
			initialValue: true
		});
		if (confirmSave) {
			await createOrUpdateConfigFile(configData);
			console.log('Configuration saved.');
		} else {
			console.log('Configuration not saved.');
		}
	}
};
