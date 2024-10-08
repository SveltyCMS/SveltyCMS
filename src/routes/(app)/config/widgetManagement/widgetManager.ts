import { dbAdapter } from '@src/databases/db';
import { promises as fs } from 'fs';
import path from 'path';

// System Logger
import { logger } from '@utils/logger';

// Path to widgets directory
const WIDGETS_DIR = path.resolve('src/components/widgets');

// Ensure widget files exist
async function ensureWidgetFiles(widgetName: string): Promise<void> {
	const widgetPath = path.join(WIDGETS_DIR, widgetName);
	try {
		await fs.access(widgetPath);
	} catch (error) {
		logger.error(`Error accessing widget files for ${widgetName}: ${error.message}`);
		throw Error(`Widget files for ${widgetName} do not exist.`);
	}
}

// Ensure necessary widgets are installed and activated
export async function ensureNecessaryWidgets(usedWidgets: string[]) {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}

	for (const widgetName of usedWidgets) {
		try {
			await ensureWidgetFiles(widgetName);
			await dbAdapter.activateWidget(widgetName);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to ensure widget ${widgetName}: ${error.message}`);
			} else {
				logger.error(`Failed to ensure widget ${widgetName}: unknown error`);
			}
		}
	}
}

// Initialize widgets during startup
export async function initializeWidgets() {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}

	try {
		// Fetch active widgets
		const activeWidgets = await dbAdapter.getActiveWidgets();
		// Add logic here to ensure necessary widgets are active
		await ensureNecessaryWidgets(activeWidgets);
		logger.info('Necessary widgets ensured and activated.');
	} catch (error) {
		if (error instanceof Error) {
			logger.error(`Error during widget initialization: ${error.message}`);
		} else {
			logger.error('Error during widget initialization: unknown error');
		}
	}
}

// Fetch all widgets
export async function getAllWidgets(): Promise<any[]> {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}
	return await dbAdapter.getAllWidgets();
}

// Fetch active widgets
export async function getActiveWidgets(): Promise<string[]> {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}
	return await dbAdapter.getActiveWidgets();
}

// we have to change this function I just duplicate the about as this was missing but imported
export async function getInstalledWidgets(): Promise<string[]> {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}
	return await dbAdapter.getActiveWidgets();
}

// Activate a widget by name
export async function activateWidget(widgetName: string): Promise<void> {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}
	if (await checkWidgetFilesExist(widgetName)) {
		return await dbAdapter.activateWidget(widgetName);
	} else {
		throw Error(`Widget files for ${widgetName} do not exist.`);
	}
}

// Deactivate a widget by name
export async function deactivateWidget(widgetName: string): Promise<void> {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}
	return await dbAdapter.deactivateWidget(widgetName);
}

// Update the configuration of an existing widget
export async function updateWidget(widgetName: string, updateData: any): Promise<void> {
	if (!dbAdapter) {
		throw Error('Database adapter not initialized');
	}
	return await dbAdapter.updateWidget(widgetName, updateData);
}

// Helper function to check if widget files exist
async function checkWidgetFilesExist(widgetName: string): Promise<boolean> {
	const widgetPath = path.join(WIDGETS_DIR, widgetName);
	try {
		await fs.access(widgetPath);
		return true;
	} catch {
		return false;
	}
}
