#!/usr/bin/env bun
/**
 * @file scripts/test-setup-safely.ts
 * @description Runs setup tests SAFELY using TEST_MODE isolation.
 * Does NOT touch config/private.ts.
 */

import { spawn } from 'child_process';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

const rootDir = join(import.meta.dir, '..');
const privateTestConfigPath = join(rootDir, 'config', 'private.test.ts');

async function main() {
	console.log('🛡️  Starting SAFE setup tests (TEST_MODE=true)...');

	// 1. Ensure clean slate for test config
	if (existsSync(privateTestConfigPath)) {
		console.log('🧹 Removing existing config/private.test.ts...');
		rmSync(privateTestConfigPath);
	}

	try {
		// 2. Build
		console.log('🔨 Building for production...');
		const buildProc = spawn('bun', ['run', 'build'], {
			cwd: rootDir,
			stdio: 'inherit',
			env: { ...process.env } // Build usually doesn't need TEST_MODE unless baking env vars?
		});
		await new Promise((resolve, reject) => {
			buildProc.on('close', (code) => (code === 0 ? resolve(0) : reject(code)));
		});

		// 3. Start Preview in TEST_MODE
		console.log('🎭 Starting Preview Server (TEST_MODE=true)...');

		const previewProc = spawn('bun', ['run', 'preview'], {
			cwd: rootDir,
			stdio: 'inherit', // Show bad output
			env: { ...process.env, PORT: '4173', TEST_MODE: 'true' }
		});

		// Give it time to start
		await new Promise((r) => setTimeout(r, 5000));

		// 4. Run Tests in TEST_MODE
		console.log('🚀 Running setup-actions.test.ts...');
		const testProc = spawn('bun', ['test', 'tests/bun/api/setup-actions.test.ts'], {
			cwd: rootDir,
			stdio: 'inherit',
			env: {
				...process.env,
				API_BASE_URL: 'http://localhost:4173',
				TEST_MODE: 'true',
				// Default credentials match the user's environment
				DB_USER: process.env.DB_USER || 'admin',
				DB_PASSWORD: process.env.DB_PASSWORD || 'Getin1972!',
				DB_NAME: process.env.DB_NAME || 'sveltycms_test'
			}
		});

		await new Promise((resolve) => {
			testProc.on('close', (code) => {
				// Graceful shutdown
				previewProc.kill('SIGTERM');
				if (code !== 0) console.error('❌ Tests failed');
				else console.log('✅ Tests passed');
				resolve(code);
			});
		});
	} catch (e) {
		console.error('❌ Execution failed:', e);
		process.exit(1);
	} finally {
		// Cleanup test config
		if (existsSync(privateTestConfigPath)) {
			console.log('🧹 Cleaning up config/private.test.ts...');
			rmSync(privateTestConfigPath);
		}
	}
}

main();
