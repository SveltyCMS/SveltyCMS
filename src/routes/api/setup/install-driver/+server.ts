/**
 * @file src/routes/api/setup/install-driver/+server.ts
 * @description An API endpoint to automatically install database drivers during setup.
 */

import * as m from '@src/paraglide/messages';
import { json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { exec } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Database driver mapping (MongoDB is default, others are optional)
const DRIVER_PACKAGES = {
	mongodb: 'mongoose',
	'mongodb+srv': 'mongoose',
	postgresql: 'postgres',
	mysql: 'mysql2',
	mariadb: 'mariadb'
} as const;

type DatabaseType = keyof typeof DRIVER_PACKAGES;

/**
 * Detects the package manager used in the project.
 */
function detectPackageManager(): 'bun' | 'yarn' | 'pnpm' | 'npm' {
	const cwd = process.cwd();

	// Check for lock files in order of preference
	if (existsSync(join(cwd, 'bun.lock'))) {
		return 'bun';
	}
	if (existsSync(join(cwd, 'yarn.lock'))) {
		return 'yarn';
	}
	if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
		return 'pnpm';
	}
	if (existsSync(join(cwd, 'package-lock.json'))) {
		return 'npm';
	}

	// Default to npm if no lock file is found
	return 'npm';
}

/**
 * Gets the install command for the detected package manager.
 */
function getInstallCommand(packageName: string, packageManager: string): string {
	switch (packageManager) {
		case 'bun':
			return `bun add ${packageName}`;
		case 'yarn':
			return `yarn add ${packageName}`;
		case 'pnpm':
			return `pnpm add ${packageName}`;
		case 'npm':
		default:
			return `npm install ${packageName}`;
	}
}

/**
 * Validates the database type and returns the corresponding package name.
 */
function getDriverPackage(dbType: string): { package: string; valid: boolean } {
	const packageName = DRIVER_PACKAGES[dbType as DatabaseType];
	return {
		package: packageName || '',
		valid: Boolean(packageName)
	};
}

/**
 * Installs a database driver package using the detected package manager.
 */
async function installDriver(packageName: string): Promise<{ success: boolean; error?: string; output?: string }> {
	try {
		logger.info(`Installing database driver: ${packageName}`);

		// Detect the package manager and get the appropriate install command
		const packageManager = detectPackageManager();
		const installCommand = getInstallCommand(packageName, packageManager);

		logger.info(`Using package manager: ${packageManager} with command: ${installCommand}`);

		// Execute the install command
		const { stdout, stderr } = await execAsync(installCommand, {
			cwd: process.cwd(),
			timeout: 120000 // 2 minute timeout
		});

		const output = stdout + stderr;
		logger.info(`Driver installation completed: ${packageName}`, { output });

		return { success: true, output };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Driver installation failed: ${packageName}`, { error: errorMessage });

		return {
			success: false,
			error: errorMessage,
			output: error instanceof Error && 'stdout' in error ? (error.stdout as string) + (error.stderr as string) : undefined
		};
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { dbType } = await request.json();

		if (!dbType || typeof dbType !== 'string') {
			return json(
				{
					success: false,
					error: 'Invalid request: dbType is required and must be a string'
				},
				{ status: 400 }
			);
		}

		const { package: packageName, valid } = getDriverPackage(dbType);

		if (!valid) {
			return json(
				{
					success: false,
					error: `Unsupported database type: ${dbType}`,
					supportedTypes: Object.keys(DRIVER_PACKAGES),
					note: 'MongoDB is the default database. Other database types are optional and require manual driver installation.'
				},
				{ status: 400 }
			);
		}

		logger.info(`Starting automatic installation of ${packageName} for ${dbType}`);

		// Add note for non-MongoDB databases
		const isDefaultDB = dbType === 'mongodb' || dbType === 'mongodb+srv';
		if (!isDefaultDB) {
			logger.info(`Note: ${dbType} is an optional database type. MongoDB is recommended as the default.`);
		}

		// Check if package is already installed by trying to import it
		try {
			await import(/* @vite-ignore */ packageName);
			logger.info(`Driver ${packageName} is already installed`);
			return json({
				success: true,
				message: m.api_install_driver_already_installed({ driver: packageName }),
				package: packageName,
				alreadyInstalled: true
			});
		} catch {
			// Package not installed, proceed with installation
		}

		const installResult = await installDriver(packageName);

		if (installResult.success) {
			return json({
				success: true,
				message: m.api_install_driver_success({ driver: packageName }),
				package: packageName,
				output: installResult.output
			});
		} else {
			return json(
				{
					success: false,
					error: m.api_install_driver_failed({ driver: packageName, error: installResult.error || 'Unknown error' }),
					package: packageName,
					details: installResult.error,
					output: installResult.output
				},
				{ status: 500 }
			);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Install driver API error:', { error: errorMessage });

		return json(
			{
				success: false,
				error: 'Internal server error during driver installation'
			},
			{ status: 500 }
		);
	}
};
