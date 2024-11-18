/**
 * @file src/routes/api/save-categories/backup-utils.ts
 * @description Utility functions for backing up and restoring category configuration files.
 *
 * This module provides functionality to:
 * - Backup and restore category files with timestamped versions
 * - Manage a limited number of backups
 * - Check existence of backup and category files
 *
 * Features:
 * - Timestamped backups for easy identification
 * - Automatic cleanup of old backups
 * - CLI-based backup selection for restoration
 */

import fs from 'fs/promises';
import path from 'path';

// System Logger
import { logger } from '@utils/logger';

const SYSTEM_COLLECTIONS_DIR = path.join(process.cwd(), 'src', 'collections');
const USER_COLLECTIONS_DIR = path.join(process.cwd(), 'config', 'collections');
const BACKUP_DIR = path.join(SYSTEM_COLLECTIONS_DIR, 'backup');
const BACKUP_LIMIT = 2; //max 2 backups

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

// Backup Category Files with timestamp
export async function backupCategoryFiles() {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

	try {
		await ensureDir(BACKUP_DIR);

		const categoriesBackup = path.join(BACKUP_DIR, `categories.backup.${timestamp}.ts`);

		// Read the current file to verify it's valid before backing up
		const currentContent = await fs.readFile(path.join(USER_COLLECTIONS_DIR, 'categories.ts'), 'utf-8');
		if (!currentContent.includes('export const categoryConfig')) {
			throw new Error('Current categories file appears to be invalid');
		}

		await fs.copyFile(path.join(USER_COLLECTIONS_DIR, 'categories.ts'), categoriesBackup);

		// Limit backups to BACKUP_LIMIT (2)
		const files = await fs.readdir(BACKUP_DIR);
		const backups = files
			.filter((file) => file.startsWith('categories.backup'))
			.sort()
			.reverse();

		if (backups.length > BACKUP_LIMIT) {
			const toDelete = backups.slice(BACKUP_LIMIT);
			for (const file of toDelete) {
				await fs.unlink(path.join(BACKUP_DIR, file));
				logger.info(`Deleted old backup: ${file}`);
			}
		}

		logger.info('Category backup completed successfully', { categoriesBackup });
		return { categoriesBackup };
	} catch (error) {
		logger.error('Error creating category backup:', error as Error);
		throw error;
	}
}

// Define your custom select function here if it's a custom function
async function select(options: { message: string; options: Array<{ name: string; value: string }> }): Promise<string> {
	// This is a placeholder implementation. You need to replace this with your actual select logic.
	logger.info(options.message);
	for (const option of options.options) {
		logger.info(`${option.value}: ${option.name}`);
	}
	// Here we just return the first option's value for simplicity
	return options.options[0].value;
}

// Restore Category Files
export async function restoreCategoryFiles() {
	try {
		const files = await fs.readdir(BACKUP_DIR);
		const backups = files
			.filter((file) => file.startsWith('categories.backup'))
			.sort()
			.reverse();

		if (backups.length === 0) {
			throw new Error('No backup files found');
		}

		const timestamps = [...new Set(backups.map((file) => file.split('.')[2]))];
		const choices = timestamps.map((timestamp) => ({
			name: new Date(timestamp.replace(/-/g, ':')).toString(),
			value: timestamp
		}));

		const selectedTimestamp = await select({
			message: 'Select a category backup to restore:',
			options: choices
		});

		if (selectedTimestamp) {
			const backupPath = path.join(BACKUP_DIR, `categories.backup.${selectedTimestamp}.ts`);
			const targetPath = path.join(USER_COLLECTIONS_DIR, 'categories.ts');

			// Verify backup file is valid before restoring
			const backupContent = await fs.readFile(backupPath, 'utf-8');
			if (!backupContent.includes('export const categoryConfig')) {
				throw new Error('Backup file appears to be invalid');
			}

			await fs.copyFile(backupPath, targetPath);
			logger.info('Category restore completed successfully', { selectedTimestamp });
		} else {
			logger.info('Category restore cancelled');
		}
	} catch (error) {
		logger.error('Error restoring category backup:', error as Error);
		throw error;
	}
}

// Check if backup files exist
export async function backupFilesExist() {
	try {
		await ensureDir(BACKUP_DIR);
		const files = await fs.readdir(BACKUP_DIR);
		return files.some((file) => file.startsWith('categories.backup'));
	} catch (error) {
		logger.error('Error checking category backup files existence:', error as Error);
		return false;
	}
}

// Check if category file exists and is valid
export async function categoryFileExists() {
	const categoriesPath = path.join(USER_COLLECTIONS_DIR, 'categories.ts');

	try {
		const content = await fs.readFile(categoriesPath, 'utf-8');
		return content.includes('export const categoryConfig');
	} catch (error) {
		logger.error('Error checking category file existence:', error as Error);
		return false;
	}
}
