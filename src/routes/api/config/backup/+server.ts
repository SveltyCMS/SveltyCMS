/**
 * @file src/routes/api/config/backup/+server.ts
 * @description API endpoint to back up the current configuration files.
 */
import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';

// Auth

export async function POST({ locals }) {
	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		return json({ success: false, message: 'Unauthorized' }, { status: 401 });
	}

	const configDir = path.join(process.cwd(), 'config');
	const backupDir = path.join(configDir, 'backups');
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

	try {
		// Ensure backup directory exists
		await fs.mkdir(backupDir, { recursive: true });

		// Define source and destination paths
		const privateSrc = path.join(configDir, 'private.ts');
		const publicSrc = path.join(configDir, 'public.ts');
		const privateDest = path.join(backupDir, `private.ts.bak-${timestamp}`);
		const publicDest = path.join(backupDir, `public.ts.bak-${timestamp}`);

		// Copy files
		await fs.copyFile(privateSrc, privateDest);
		await fs.copyFile(publicSrc, publicDest);

		return json({ success: true, message: 'Backup created successfully.' });
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error('Configuration backup failed:', error);
		return json({ success: false, message: `Backup failed: ${errorMessage}` }, { status: 500 });
	}
}
