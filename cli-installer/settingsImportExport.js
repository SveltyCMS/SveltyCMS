/**
 * @file cli-installer/settingsImportExport.js
 * @description Import/Export settings using the new API endpoints
 */
import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import pc from 'picocolors';

export async function exportSettings() {
	try {
		const response = await fetch('/api/settings/export');
		if (!response.ok) throw new Error('Failed to export settings');
		const data = await response.json();
		const filePath = path.join(process.cwd(), 'settings-export.json');
		await fs.writeFile(filePath, JSON.stringify(data.settings, null, 2));
		console.log(pc.green(`Settings exported to ${filePath}`));
	} catch (err) {
		console.error(pc.red('Error exporting settings:'), err.message);
	}
}

export async function importSettings() {
	try {
		const filePath = path.join(process.cwd(), 'settings-import.json');
		const settings = JSON.parse(await fs.readFile(filePath, 'utf-8'));
		const response = await fetch('/api/settings/import', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ settings })
		});
		if (!response.ok) throw new Error('Failed to import settings');
		console.log(pc.green('Settings imported successfully.'));
	} catch (err) {
		console.error(pc.red('Error importing settings:'), err.message);
	}
}
