import fs from 'fs/promises';
import pathModule from 'path';
import { exec } from 'child_process';
import { select } from '@clack/prompts';

// Backup Config Files with timestamp
export async function backupConfigFiles() {
    const configDir = pathModule.join(process.cwd(), 'config');
    const backupDir = pathModule.join(configDir, 'backup');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
        await fs.mkdir(backupDir, { recursive: true });

        const privateBackup = pathModule.join(backupDir, `private.ts.bak.${timestamp}`);
        const publicBackup = pathModule.join(backupDir, `public.ts.bak.${timestamp}`);

        await fs.copyFile(pathModule.join(configDir, 'private.ts'), privateBackup);
        await fs.copyFile(pathModule.join(configDir, 'public.ts'), publicBackup);

        // Limit backups to 5
        const files = await fs.readdir(backupDir);
        const backups = files.filter(file => file.startsWith('private.ts.bak') || file.startsWith('public.ts.bak'))
                             .sort()
                             .reverse();

        if (backups.length > 10) { // since each backup consists of two files
            const toDelete = backups.slice(10);
            for (const file of toDelete) {
                await fs.unlink(pathModule.join(backupDir, file));
            }
        }

        console.log('Backup completed successfully!');
    } catch (error) {
        console.error('Error creating backup:', error);
    }
}

// Restore Config Files
export async function restoreConfigFiles() {
    const backupDir = pathModule.join(process.cwd(), 'config', 'backup');
    
    try {
        const files = await fs.readdir(backupDir);
        const backups = files.filter(file => file.startsWith('private.ts.bak') || file.startsWith('public.ts.bak'))
                             .sort()
                             .reverse();

        const timestamps = [...new Set(backups.map(file => file.split('.').slice(3).join('.')))];
        const choices = timestamps.map(timestamp => ({
            name: new Date(timestamp.replace(/-/g, ':')).toString(),
            value: timestamp
        }));

        const selectedTimestamp = await select({
            message: 'Select a backup to restore:',
            options: choices
        });

        if (selectedTimestamp) {
            await fs.copyFile(pathModule.join(backupDir, `private.ts.bak.${selectedTimestamp}`), pathModule.join(process.cwd(), 'config', 'private.ts'));
            await fs.copyFile(pathModule.join(backupDir, `public.ts.bak.${selectedTimestamp}`), pathModule.join(process.cwd(), 'config', 'public.ts'));
            console.log('Restore completed successfully!');
        } else {
            console.log('Restore cancelled.');
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
    }
}

// Database Backup (Example for MongoDB)
export async function backupDatabase(dbHost, dbName) {
    const backupDir = pathModule.join(process.cwd(), 'config', 'backup');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = pathModule.join(backupDir, `db-backup-${dbName}-${timestamp}.gz`);
    
    try {
        await fs.mkdir(backupDir, { recursive: true });
        exec(`mongodump --uri=${dbHost}/${dbName} --archive=${backupFile} --gzip`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error backing up database: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Backup process stderr: ${stderr}`);
                return;
            }
            console.log(`Database backup completed: ${backupFile}`);
        });
    } catch (error) {
        console.error('Error creating database backup:', error);
    }
}