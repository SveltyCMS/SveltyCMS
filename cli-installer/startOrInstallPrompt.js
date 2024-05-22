import { select, isCancel, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { Title } from './cli-installer.js';
import ts from 'typescript';
import { importSingleTs } from 'import-single-ts';

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

// Creates or overwrites a backup of a config file.
function createBackup(filePath) {
	const backupPath = path.join(process.cwd(), 'config', `${path.basename(filePath, '.ts')}.backup.ts`);
	try {
		fs.copyFileSync(filePath, backupPath);
		console.log(pc.blue(`Backup created at ${backupPath}`));
	} catch (error) {
		console.error(pc.red(`Failed to create backup: ${error.message}`));
	}
}

export const startOrInstallPrompt = async () => {
	// SveltyCMS Title
	Title();

	// Define the paths for the configuration files
	const privateConfigPath = path.join(process.cwd(), 'config', 'private.ts');
	const publicConfigPath = path.join(process.cwd(), 'config', 'public.ts');

	// Check if the required files exist
	const privateExists = fs.existsSync(privateConfigPath);
	const publicExists = fs.existsSync(publicConfigPath);

	// Create backups and read configuration files only if they exist
	if (privateExists) {
		createBackup(privateConfigPath);
		privateConfig = (await importConfig(privateConfigPath)).privateEnv;
	}
	if (publicExists) {
		createBackup(publicConfigPath);
		publicConfig = (await importConfig(publicConfigPath)).publicEnv;
	}

	// Determine the message and options based on the existence of configuration files
	let message;
	let options;

	// Only add the 'Start' option if both files exist
	if (privateExists && publicExists) {
		// Update Existing Setup
		message = pc.green('Configuration found. What would you like to do?');
		options = [
			{ value: 'install', label: 'Configure SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'start', label: 'Start SvelteCMS', hint: 'Launch your SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	} else {
		// Fresh Setup
		message = pc.yellow("No configuration files found. Let's get started with your setup.");
		options = [
			{ value: 'install', label: 'Setup your SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	}

	const selection = await select({ message, options });

	if (isCancel(selection) || selection === 'exit') {
		outro('Thank you for using SveltyCMS CLI Installer.');
		process.exit(0); // Exit with code 0
	}

	return selection;
};

export { privateConfig, publicConfig };
