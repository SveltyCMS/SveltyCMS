import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, mock } from 'bun:test';

// Mock compilation
mock.module('@src/collections/compile', () => ({
	compileCollections: async () => ({
		collections: [],
		errors: []
	})
}));

describe('Setup Presets Integration', () => {
	const presetDir = path.resolve('src/presets/test_preset');
	const configDir = path.resolve('config/collections');
	const testFile = 'TestCollection.ts';

	// Helper to simulate the copy logic from +page.server.ts
	async function installPreset(presetName: string) {
		const fsPromises = fs.promises;
		const presetSource = path.resolve(process.cwd(), 'src', 'presets', presetName);
		const target = path.resolve(process.cwd(), 'config', 'collections');

		await fsPromises.mkdir(target, { recursive: true });

		// Check if preset dir exists
		try {
			await fsPromises.access(presetSource);
			const files = await fsPromises.readdir(presetSource);

			for (const file of files) {
				if (file.endsWith('.ts')) {
					await fsPromises.copyFile(path.join(presetSource, file), path.join(target, file));
				}
			}
			return true;
		} catch (_e) {
			return false;
		}
	}

	it('should copy preset files to config/collections', async () => {
		// Setup mock preset
		if (!fs.existsSync(presetDir)) {
			fs.mkdirSync(presetDir, { recursive: true });
		}
		fs.writeFileSync(path.join(presetDir, testFile), 'export default {};');

		const success = await installPreset('test_preset');
		expect(success).toBe(true);

		const targetFile = path.join(configDir, testFile);
		expect(fs.existsSync(targetFile)).toBe(true);
		expect(fs.readFileSync(targetFile, 'utf-8')).toBe('export default {};');

		// Cleanup
		fs.rmSync(presetDir, { recursive: true, force: true });
		if (fs.existsSync(targetFile)) {
			fs.unlinkSync(targetFile);
		}
	});
});
