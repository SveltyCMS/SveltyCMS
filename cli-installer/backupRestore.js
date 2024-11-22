/** 
@file cli-installer/backupRestore.js
@description Backup and Restore Configuration Files
*/

import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { select, isCancel, note, confirm } from '@clack/prompts';
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

// Format the date to a human-readable format
function formatTimestamp(date) {
	const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
	return new Intl.DateTimeFormat('en-US', options).format(date).replace(/[:]/g, '-').replace(/[,]/g, '').replace(/ /g, '_');
}

// Backup Config Files with timestamp
export async function backupConfigFiles() {
	const timestamp = formatTimestamp(new Date());

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
			console.log('Restore completed successfully!');
		} else {
			console.log('Restore cancelled.');
		}
	} catch (error) {
		console.error('Error restoring backup:', error);
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

// Database Backup (Example for MongoDB)
export async function backupDatabase(dbHost, dbName) {
	const timestamp = formatTimestamp(new Date());
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

		note(`Private: ${pc.green(shortPrivateBackup)}\n` + `Public: ${pc.green(shortPublicBackup)}`, pc.green('Backup completed successfully:'));

		const confirmProceed = await confirm({
			message: 'Do you want to proceed to configuration?',
			initialValue: true
		});

		if (!confirmProceed) {
			await cancelOperation();
			return;
		}

		// Proceed to configuration
		return 'configuration';
	}

	// Display a note about navigation instructions
	note(`Backup the current configuration files or\n` + `restore from a previous backup.`, pc.green('Backup/Restore Options:'));

	const options = [
		{ value: 'backup', label: 'Backup Current Configuration', hint: 'Create a backup of your config files' },
		{ value: 'restore', label: 'Restore from Backup', hint: 'Restore configuration files from a previous backup' },
		{ value: 'database', label: 'Backup your Database', hint: 'Create a backup of your SveltyCMS database' },
		{ value: 'Exit', label: 'Exit to Installer', hint: 'Exit the SveltyCMS installer' }
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

			note(`Private: ${pc.green(shortPrivateBackup)}\n` + `Public: ${pc.green(shortPublicBackup)}`, pc.green('Backup completed successfully:'));

			const confirmProceed = await confirm({
				message: 'Do you want to proceed to configuration?',
				initialValue: true
			});

			if (!confirmProceed) {
				await cancelOperation();
				return;
			}
			break;
		}
		case 'restore':
			await restoreConfigFiles();
			break;
		case 'database': {
			// Prompt for database credentials
			const dbHost = await select({
				message: 'Enter your database host:',
				options: [
					{ value: 'localhost', label: 'localhost' },
					{ value: 'custom', label: 'Custom' }
				]
			});

			let dbHostCustom = dbHost;
			if (dbHost === 'custom') {
				dbHostCustom = await select({
					message: 'Enter the custom database host:',
					options: []
				});
			}

			const dbName = await select({
				message: 'Enter your database name:',
				options: []
			});

			const dbBackupFile = await backupDatabase(dbHostCustom, dbName);

			note(`File: ${pc.green(dbBackupFile)}`, pc.green('Database backup completed successfully:'));

			const confirmProceed = await confirm({
				message: 'Do you want to proceed to configuration?',
				initialValue: true
			});

			if (!confirmProceed) {
				await cancelOperation();
				return;
			}
			break;
		}
		case 'exit':
			await cancelOperation();
			return;
		default:
			console.log('Invalid choice.');
			return;
	}
	return 'configuration';
};
