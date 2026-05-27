//@file tests/playwright/global.teardown.ts
// This is a simple cleanup file referenced in playwright.config.ts

import fs from 'node:fs/promises';
import path from 'node:path';
import { test as teardown } from '@playwright/test';

const authFile = path.resolve(import.meta.dirname, '..', '..', 'setup-storage-state.json');

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
