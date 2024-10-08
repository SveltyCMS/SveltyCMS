/**
 * @file src/routes/api/save-config/backup-utils.ts
 * @description Utility functions for backing up and restoring configuration files and database.
 *
 * This module provides functionality to:
 * - Backup and restore configuration files with timestamped versions
 * - Manage a limited number of backups
 * - Check existence of backup and configuration files
 * - Perform database backups (example for MongoDB)
 *
 * Features:
 * - Timestamped backups for easy identification
 * - Automatic cleanup of old backups
 * - Separate backup storage for private and public configurations
 * - CLI-based backup selection for restoration
 * - Database backup support (MongoDB example)
 *
 * Usage:
 * Import and use these functions in your configuration management and backup routines.
 *
 * Note: Ensure proper access controls are in place as these functions deal with
 * sensitive configuration data and database operations.
 */

import fs from 'fs/promises';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';

// System Logger
import { logger } from '@utils/logger';

// Promisify exec for async usage
const execAsync = util.promisify(exec);

const CONFIG_DIR = path.join(process.cwd(), 'config');
const BACKUP_DIR = path.join(CONFIG_DIR, 'backup');
const BACKUP_LIMIT = 5; // Max number of backup pairs (private + public)

async function ensureDir(dir: string) {
	try {
		await fs.mkdir(dir, { recursive: true });
	} catch (error: any) {
		if (error.code !== 'EEXIST') {
			logger.error(`Error creating directory ${dir}:`, error);
			throw error;
		}
	}
}

// Backup Config Files with timestamp
export async function backupConfigFiles() {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

	try {
		await ensureDir(BACKUP_DIR);

		const privateBackup = path.join(BACKUP_DIR, `private.backup.${timestamp}.ts`);
		const publicBackup = path.join(BACKUP_DIR, `public.backup.${timestamp}.ts`);

		await fs.copyFile(path.join(CONFIG_DIR, 'private.ts'), privateBackup);
		await fs.copyFile(path.join(CONFIG_DIR, 'public.ts'), publicBackup);

		// Limit backups to BACKUP_LIMIT
		const files = await fs.readdir(BACKUP_DIR);
		const backups = files
			.filter((file) => file.startsWith('private.backup') || file.startsWith('public.backup'))
			.sort()
			.reverse();

		if (backups.length > BACKUP_LIMIT * 2) {
			const toDelete = backups.slice(BACKUP_LIMIT * 2);
			for (const file of toDelete) {
				await fs.unlink(path.join(BACKUP_DIR, file));
			}
		}

		logger.info('Backup completed successfully', { privateBackup, publicBackup });
		return { privateBackup, publicBackup };
	} catch (error) {
		logger.error('Error creating backup:', error as Error);
		throw error;
	}
}

// Define your custom select function here if it's a custom function
async function select(options: { message: string; options: Array<{ name: string; value: string }> }): Promise<string> {
	// This is a placeholder implementation. You need to replace this with your actual select logic.
	// For example, you can use a prompt library or implement your own CLI selection mechanism.
	logger.info(options.message);
	for (const option of options.options) {
		logger.info(`${option.value}: ${option.name}`);
	}
	// Here we just return the first option's value for simplicity
	return options.options[0].value;
}

// Restore Config Files
export async function restoreConfigFiles() {
	try {
		const files = await fs.readdir(BACKUP_DIR);
		const backups = files
			.filter((file) => file.startsWith('private.backup') || file.startsWith('public.backup'))
			.sort()
			.reverse();

		const timestamps = [...new Set(backups.map((file) => file.split('.')[2]))];
		const choices = timestamps.map((timestamp) => ({
			name: new Date(timestamp.replace(/-/g, ':')).toString(),
			value: timestamp
		}));

		const selectedTimestamp = await select({
			message: 'Select a backup to restore:',
			options: choices
		});

		if (selectedTimestamp) {
			await fs.copyFile(path.join(BACKUP_DIR, `private.backup.${selectedTimestamp}.ts`), path.join(CONFIG_DIR, 'private.ts'));
			await fs.copyFile(path.join(BACKUP_DIR, `public.backup.${selectedTimestamp}.ts`), path.join(CONFIG_DIR, 'public.ts'));
			logger.info('Restore completed successfully', { selectedTimestamp });
		} else {
			logger.info('Restore cancelled');
		}
	} catch (error) {
		logger.error('Error restoring backup:', error as Error);
		throw error;
	}
}

// Check if backup files exist
export async function backupFilesExist() {
	try {
		await ensureDir(BACKUP_DIR);
		const files = await fs.readdir(BACKUP_DIR);
		return files.some((file) => file.startsWith('private.backup') || file.startsWith('public.backup'));
	} catch (error) {
		logger.error('Error checking backup files existence:', error as Error);
		return false;
	}
}

// Check if config files exist
export async function configFilesExist() {
	const privateConfigPath = path.join(CONFIG_DIR, 'private.ts');
	const publicConfigPath = path.join(CONFIG_DIR, 'public.ts');

	try {
		const [privateExists, publicExists] = await Promise.all([
			fs
				.access(privateConfigPath)
				.then(() => true)
				.catch(() => false),
			fs
				.access(publicConfigPath)
				.then(() => true)
				.catch(() => false)
		]);
		return privateExists || publicExists;
	} catch (error) {
		logger.error('Error checking config files existence:', error as Error);
		return false;
	}
}

// Database Backup (Example for MongoDB)
export async function backupDatabase(dbHost: string, dbName: string) {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupFile = path.join(BACKUP_DIR, `db-backup-${dbName}-${timestamp}.gz`);

	try {
		await ensureDir(BACKUP_DIR);
		await execAsync(`mongodump --uri=${dbHost}/${dbName} --archive=${backupFile} --gzip`);
		logger.info('Database backup completed successfully', { backupFile });
		return backupFile;
	} catch (error) {
		logger.error('Error creating database backup:', error as Error);
		throw error;
	}
}
