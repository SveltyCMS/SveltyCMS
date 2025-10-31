//@file tests/playwright/global.teardown.ts
// This is a simple cleanup file referenced in playwright.config.ts

import { test as teardown } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const authFile = path.resolve(__dirname, '..', '..', 'setup-storage-state.json');

teardown('cleanup auth state', async () => {
	try {
		await fs.unlink(authFile);
		console.log('Cleaned up auth state file.');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.error('Could not clean up auth state file:', error);
		}
	}
});
