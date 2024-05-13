import { select } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { Title } from './cli-installer.js';

import ts from 'typescript';

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

async function importConfig(filePath) {
	if (fs.existsSync(filePath)) {
		try {
			const tsCode = fs.readFileSync(filePath, 'utf-8');
			const compilerOptions = {
				target: ts.ScriptTarget.ESNext, // Compile to ESNext
				module: ts.ModuleKind.CommonJS
			};
			const jsCode = transpileToJS(tsCode, compilerOptions);
			// Set up a mock require function for CommonJS compatibility
			const requireMock = (module) => {
				if (module === 'fs') {
					return fs;
				} else if (module === 'path') {
					return path;
				}
				// Add more modules as needed
				throw new Error(`Cannot find module '${module}'`);
			};
			const moduleExports = {};
			const moduleWrapper = new Function('exports', 'require', jsCode);
			moduleWrapper(moduleExports, requireMock);
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
	let privateExists = fs.existsSync(privateConfigPath);
	let publicExists = fs.existsSync(publicConfigPath);

	// Create backups and read configuration files only if they exist
	if (privateExists) {
		createBackup(privateConfigPath);
		privateExists = await importConfig(privateConfigPath);
	}
	if (publicExists) {
		createBackup(publicConfigPath);
		publicExists = await importConfig(publicConfigPath);
	}

	// Determine the message and options based on the existence of configuration files
	let message;
	let options;
	// Only add the 'Start' option if both files exist
	if (privateExists && publicExists) {
		message = pc.green('Configuration found. What would you like to do?');
		options = [
			{ value: 'install', label: 'Configure SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'start', label: 'Start SvelteCMS', hint: 'Launch your SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	} else {
		message = pc.yellow("No configuration files found. Let's get started with your setup.");
		options = [
			{ value: 'install', label: 'Setup your SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	}

	return select({ message, options });
};
