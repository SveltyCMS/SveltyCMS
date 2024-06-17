import fs from 'fs/promises';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';

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
			console.error(`Error creating directory ${dir}:`, error);
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

		console.log('Backup completed successfully!');
		return { privateBackup, publicBackup };
	} catch (error) {
		console.error('Error creating backup:', error);
		throw error;
	}
}

// Define your custom select function here if it's a custom function
async function select(options: { message: string; options: Array<{ name: string; value: string }> }): Promise<string> {
	// This is a placeholder implementation. You need to replace this with your actual select logic.
	// For example, you can use a prompt library or implement your own CLI selection mechanism.
	console.log(options.message);
	for (const option of options.options) {
		console.log(`${option.value}: ${option.name}`);
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
			console.log('Restore completed successfully!');
		} else {
			console.log('Restore cancelled.');
		}
	} catch (error) {
		console.error('Error restoring backup:', error);
	}
}

// Check if backup files exist
export async function backupFilesExist() {
	try {
		await ensureDir(BACKUP_DIR);
		const files = await fs.readdir(BACKUP_DIR);
		return files.some((file) => file.startsWith('private.backup') || file.startsWith('public.backup'));
	} catch (error) {
		return false;
	}
}

// Check if config files exist
export async function configFilesExist() {
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
export async function backupDatabase(dbHost: string, dbName: string) {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupFile = path.join(BACKUP_DIR, `db-backup-${dbName}-${timestamp}.gz`);

	try {
		await ensureDir(BACKUP_DIR);
		await execAsync(`mongodump --uri=${dbHost}/${dbName} --archive=${backupFile} --gzip`);
		console.log(`Database backup completed: ${backupFile}`);
		return backupFile;
	} catch (error) {
		console.error('Error creating database backup:', error);
		throw error;
	}
}
