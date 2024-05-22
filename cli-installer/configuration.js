import { isCancel, select, confirm, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

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

let publicConfig = { };
let privateConfig = { };

// Helper function to transpile TypeScript code to JavaScript
function transpileToJS(tsCode, compilerOptions) {
	const result = ts.transpileModule(tsCode, {
		...compilerOptions,
		module: ts.ModuleKind.CommonJS
	});

	// Check for compilation errors
	if (result.diagnostics && result.diagnostics.length > 0) {
		const errors = result.diagnostics.map((diagnostic) => diagnostic.messageText).join('\n');
		throw new Error(`TypeScript compilation errors:\n${errors}`);
	}

	return result.outputText;
}

function importTSModule(filePath) {
	const compilerOptions = {
		target: ts.ScriptTarget.ESNext, // Compile to ESNext
		module: ts.ModuleKind.CommonJS
	};
	const tsCode = fs.readFileSync(filePath, 'utf-8');
	return transpileToJS(tsCode, compilerOptions)
}

async function importConfig(filePath) {
	if (fs.existsSync(filePath)) {
		try {
			let jsCode = importTSModule(filePath);
			jsCode = jsCode.replaceAll('require(', 'await require(');
			
			// Set up a mock require function for CommonJS compatibility
			const requireMock = async (module) => {
				// Add more modules as needed
				const typesModule = await importSingleTs(path.join(process.cwd(), 'config', 'types.ts'));
				const registeredModules = {
					'fs': fs,
					'path': path,
					'./types': typesModule,
				}
				return registeredModules[module] || (() => { throw new Error(`Cannot find module '${module}'`); })();
			};

			const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
			const moduleExports = {};
			const moduleWrapper = new AsyncFunction('exports', 'require', jsCode);
			await moduleWrapper(moduleExports, requireMock);
			return moduleExports.default || moduleExports;
		} catch (error) {
			console.error(`Error importing configuration file: ${error.message}`);
		}
	} else {
		console.log(`Configuration file not found: ${filePath}`);
	}
	return {};
}

function createBackup() {
	const privateConfigPath = path.join(process.cwd(), 'config', 'private.ts');
	const publicConfigPath = path.join(process.cwd(), 'config', 'public.ts');

	const createBackupForFile = (filePath) => {
		const backupPath = path.join(process.cwd(), 'config', `${path.basename(filePath, '.ts')}.backup.ts`);
		try {
			fs.copyFileSync(filePath, backupPath);
			return `Backup created at /config/${path.basename(backupPath)}`;
		} catch (error) {
			return `Failed to create backup: ${error.message}`;
		}
	};

	const backupMessages = [];
	if (fs.existsSync(privateConfigPath)) {
		backupMessages.push(createBackupForFile(privateConfigPath));
	}
	if (fs.existsSync(publicConfigPath)) {
		backupMessages.push(createBackupForFile(publicConfigPath));
	}

	return backupMessages;
}

export const configurationPrompt = async () => {
	// SveltyCMS Title
	Title();

	// Perform the backup process
	const privateConfigPath = path.join(process.cwd(), 'config', 'private.ts');
	const publicConfigPath = path.join(process.cwd(), 'config', 'public.ts');
	let backupMessages = [];

	const privateExists = fs.existsSync(privateConfigPath);
	const publicExists = fs.existsSync(publicConfigPath);

	if (privateExists || publicExists) {
		backupMessages = createBackup();
		note(backupMessages.map((message) => pc.blue(message)).join('\n'), pc.green('Configuration found, backup created:'));
	} else {
		note(pc.green('No existing configuration found. Default configuration loaded. Please complete the required setup.'), pc.green('Fresh Install:'));
	}

	// Initialize an object to store all the configuration data
	let configData = {};
	if (privateExists) {
		privateConfig = (await importConfig(privateConfigPath)).privateEnv;
		configData = { ...configData, ...privateConfig };
	}
	if (publicExists) {
		publicConfig = (await importConfig(publicConfigPath)).publicEnv;
		configData = {  ...configData, ...privateConfig };
	}


	let projectConfigure;
	const exitConfirmed = false;

	do {
		// Configure SvelteCMS
		projectConfigure = await select({
			message: 'Configure SvelteCMS - Pick a Category (* Required)',
			options: [
				{ value: 'Database', label: configData.database ? pc.green('Database *') : 'Database *', hint: 'Configure Database', required: true },
				{ value: 'Email', label: configData.email ? pc.green('Email *') : 'Email *', hint: 'Configure Email Server', required: true },
				{ value: 'Language', label: configData.language ? pc.green('Language') : 'Language', hint: 'Configure System & Content Languages' },
				{ value: 'System', label: configData.system ? pc.green('System') : 'System', hint: 'Configure System settings' },
				{ value: 'Media', label: configData.media ? pc.green('Media') : 'Media', hint: 'Configure Media handling' },
				{ value: 'Google', label: configData.google ? pc.green('Google') : 'Google', hint: 'Configure Google API' },
				{ value: 'Redis', label: configData.redis ? pc.green('Redis') : 'Redis', hint: 'Configure Redis cache' },
				{ value: 'Mapbox', label: configData.mapbox ? pc.green('Mapbox') : 'Mapbox', hint: 'Configure Mapbox API' },
				{ value: 'Tiktok', label: configData.tiktok ? pc.green('Tiktok') : 'Tiktok', hint: 'Configure Tiktok API' },
				{ value: 'OpenAI', label: configData.openai ? pc.green('OpenAI') : 'OpenAI', hint: 'Define OpenAI API' },
				{ value: 'Exit', label: 'Exit', hint: 'Exit the installer' }
			]
		});

		if (isCancel(projectConfigure)) {
			await cancelOperation();
			return;
		}

		switch (projectConfigure) {
			case 'Database': {
				const result = await configureDatabase();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.database = result;
				break;
			}
			case 'Email': {
				const result = await configureEmail();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.email = result;
				break;
			}
			case 'Language': {
				const result = await configureLanguage();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.language = result;
				break;
			}
			case 'System': {
				const result = await configureSystem();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.system = result;
				break;
			}
			case 'Media': {
				const result = await configureMedia();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.media = result;
				break;
			}
			case 'Google': {
				const result = await configureGoogle();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.google = result;
				break;
			}
			case 'Redis': {
				const result = await configureRedis();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.redis = result;
				break;
			}
			case 'Mapbox': {
				const result = await configureMapbox();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.mapbox = result;
				break;
			}
			case 'Tiktok': {
				const result = await configureTiktok();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.tiktok = result;
				break;
			}
			case 'OpenAI': {
				const result = await configureOpenAI();
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData.openai = result;
				break;
			}
			case 'Exit': {
				if (!configData.database || !configData.email) {
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
						await createOrUpdateConfigFile(configData);
						console.log('Configuration saved.');
						outro('Thank you for using SveltyCMS CLI Installer.');
						process.exit(0);
					}
				}

				outro('Thank you for using SveltyCMS CLI Installer.');
				process.exit(0);
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
