/** 
@file cli-installer/backupRestore.js
@description Backup and Restore Configuration Files

### Features
- Creates a backup of the current configuration files
- Restores a backup of the configuration files
- Prompts for the backup file to restore
*/

import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { select, isCancel, note, text } from '@clack/prompts';
import { Title, cancelOperation } from './cli-installer.js';
import pc from 'picocolors';

const exec = promisify(execCb);

const CONFIG_DIR = path.join(process.cwd(), 'config');
const BACKUP_DIR = path.join(CONFIG_DIR, 'backup');
const BACKUP_LIMIT = 5; // Max number of backup pairs (private + public)

async function ensureDir(dir) {
	try {
		await fs.mkdir(dir, { recursive: true });
	} catch (error) {
		if (error.code !== 'EEXIST') {
			console.error(`Error creating directory ${dir}:`, error);
			throw error;
		}
	}
}

// Format the date for filenames (ISO 8601 compatible)
function formatTimestampForFilename(date) {
	return date.toISOString().replace(/:/g, '-');
}

// Format the date for display in prompts (locale-specific, readable)
function formatTimestampForDisplay(isoTimestamp) {
	try {
		// Attempt to parse the ISO-like string back into a Date
		const date = new Date(isoTimestamp.replace(/-/g, ':').replace('T', ' ').split('.')[0]);
		if (isNaN(date.getTime())) {
			// If parsing fails, return the original string or a placeholder
			return isoTimestamp;
		}
		const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
		return new Intl.DateTimeFormat('default', options).format(date);
	} catch (e) {
		// Fallback in case of unexpected errors
		console.error('Error formatting timestamp for display:', e);
		return isoTimestamp;
	}
}

// Backup Config Files with timestamp
export async function backupConfigFiles() {
	const timestamp = formatTimestampForFilename(new Date());

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

		return { privateBackup, publicBackup };
	} catch (error) {
		console.error('Error creating backup:', error);
		throw error;
	}
}

// Restore Config Files
export async function restoreConfigFiles() {
	try {
		const files = await fs.readdir(BACKUP_DIR);
		const backups = files
			.filter((file) => file.startsWith('private.backup') || file.startsWith('public.backup'))
			.sort()
			.reverse();

		// Extract unique timestamps (assuming format like private.backup.TIMESTAMP.ts)
		const timestamps = [...new Set(backups.map((file) => file.split('.').slice(2, -1).join('.')))].filter(Boolean); // Handle potential variations

		if (timestamps.length === 0) {
			note('No valid backups found to restore.', pc.yellow('Restore Notice'));
			return;
		}

		const choices = timestamps.map((timestamp) => ({
			label: formatTimestampForDisplay(timestamp), // Use readable format for display
			value: timestamp // Keep original format for filename matching
		}));

		const selectedTimestamp = await select({
			message: 'Select a backup to restore:',
			options: choices
		});

		if (selectedTimestamp) {
			if (isCancel(selectedTimestamp)) {
				console.log(pc.yellow('Restore cancelled.'));
				return;
			}

			await fs.copyFile(path.join(BACKUP_DIR, `private.backup.${selectedTimestamp}.ts`), path.join(CONFIG_DIR, 'private.ts'));
			await fs.copyFile(path.join(BACKUP_DIR, `public.backup.${selectedTimestamp}.ts`), path.join(CONFIG_DIR, 'public.ts'));
			note(`Configuration restored from backup dated: ${formatTimestampForDisplay(selectedTimestamp)}`, pc.green('Restore Successful'));
		}
	} catch (error) {
		console.error(pc.red('Error restoring backup:'), error);
		note('Failed to restore configuration files. Please check permissions and backup files.', pc.red('Restore Failed'));
	}
}

// Check if backup files exist
async function backupFilesExist() {
	try {
		await ensureDir(BACKUP_DIR);
		const files = await fs.readdir(BACKUP_DIR);
		return files.some((file) => file.startsWith('private.backup') || file.startsWith('public.backup'));
	} catch {
		return false;
	}
}

// Check if config files exist
async function configFilesExist() {
	const privateConfigPath = path.join(CONFIG_DIR, 'private.ts');
	const publicConfigPath = path.join(CONFIG_DIR, 'public.ts');

	const privateExists = await fs
		.stat(privateConfigPath)
		.then(() => true)
		.catch(() => false);
	const publicExists = await fs
		.stat(publicConfigPath)
		.then(() => true)
		.catch(() => false);

	return privateExists || publicExists;
}

// Database Backup (Currently supports MongoDB via mongodump)
export async function backupDatabase(dbHost, dbName) {
	// Note: This function currently assumes MongoDB. Add checks or logic for other DB types if needed.
	note('Database backup currently supports MongoDB via `mongodump`. Ensure `mongodump` is installed and in your PATH.', pc.yellow('DB Backup Info'));

	const timestamp = formatTimestampForFilename(new Date());
	const backupFile = path.join(BACKUP_DIR, `db-backup-${dbName}-${timestamp}.gz`);

	try {
		await ensureDir(BACKUP_DIR);
		await exec(`mongodump --uri=${dbHost}/${dbName} --archive=${backupFile} --gzip`);
		console.log(`Database backup completed: ${backupFile}`);
		return backupFile;
	} catch (error) {
		console.error('Error creating database backup:', error);
		throw error;
	}
}

// Prompt to Backup or Restore
export const backupRestorePrompt = async () => {
	// Display the title
	Title();

	const configExists = await configFilesExist();

	if (!configExists) {
		// Skip backup and restore if no config files exist
		note(pc.green('No existing configuration found. Default configuration loaded. Please complete the required setup.'), pc.green('Fresh Install:'));

		return 'configuration';
	}

	const backupsExist = await backupFilesExist();

	if (!backupsExist) {
		// Automatically backup if no backups exist
		const { privateBackup, publicBackup } = await backupConfigFiles();
		const shortPrivateBackup = path.relative(process.cwd(), privateBackup);
		const shortPublicBackup = path.relative(process.cwd(), publicBackup);

		note(`Private: ${pc.green(shortPrivateBackup)}\n` + `Public: ${pc.green(shortPublicBackup)}`, pc.green('Config Backup Successful'));
		return 'configuration'; // Proceed directly
	}

	// Display a note about navigation instructions
	note(`Backup the current configuration files or\n` + `restore from a previous backup.`, pc.green('Backup/Restore Options:'));

	const options = [
		{ value: 'backup', label: 'Backup Current Configuration', hint: 'Create a backup of your config files' },
		{ value: 'restore', label: 'Restore from Backup', hint: 'Restore configuration files from a previous backup' },
		{ value: 'database', label: 'Backup Database (MongoDB)', hint: 'Create a backup of your SveltyCMS MongoDB database' },
		{ value: 'continue', label: 'Continue to Configuration', hint: 'Proceed without backup/restore actions' } // Changed Exit to Continue
	];

	const choice = await select({
		message: 'What would you like to do?',
		options
	});

	if (isCancel(choice)) {
		await cancelOperation();
		return;
	}

	switch (choice) {
		case 'backup': {
			const { privateBackup, publicBackup } = await backupConfigFiles();
			const shortPrivateBackup = path.relative(process.cwd(), privateBackup);
			const shortPublicBackup = path.relative(process.cwd(), publicBackup);

			note(`Private: ${pc.green(shortPrivateBackup)}\n` + `Public: ${pc.green(shortPublicBackup)}`, pc.green('Config Backup Successful'));
			break;
		}
		case 'restore':
			await restoreConfigFiles();
			break;
		case 'database': {
			// Prompt for database credentials using text input
			const dbHost = await text({
				message: 'Enter your MongoDB connection URI (e.g., mongodb://user:pass@host:port):',
				placeholder: 'mongodb://localhost:27017',
				validate: (value) => {
					if (!value) return 'Connection URI is required.';
					if (!value.startsWith('mongodb://') && !value.startsWith('mongodb+srv://')) return 'URI should start with mongodb:// or mongodb+srv://';
				}
			});
			if (isCancel(dbHost)) {
				await cancelOperation();
				return;
			}

			const dbName = await text({
				message: 'Enter the database name to backup:',
				placeholder: 'sveltycms_db',
				validate: (value) => {
					if (!value) return 'Database name is required.';
				}
			});
			if (isCancel(dbName)) {
				await cancelOperation();
				return;
			}

			try {
				const dbBackupFile = await backupDatabase(dbHost, dbName);
				note(`File: ${pc.green(path.relative(process.cwd(), dbBackupFile))}`, pc.green('Database Backup Successful'));
			} catch (e) {
				// Error is logged within backupDatabase, but log it here too for context
				console.error(pc.red('Database backup process failed:'), e);
				note(
					'Database backup failed. Please check the connection URI, database name, and ensure `mongodump` is installed. See console for details.',
					pc.red('Database Backup Failed')
				);
			}
			break;
		}
		case 'continue': // Changed from 'exit'
			// Just break and proceed to return 'configuration'
			break;
		default:
			console.log(pc.yellow('Invalid choice.'));
			return;
	}
	return 'configuration';
};
