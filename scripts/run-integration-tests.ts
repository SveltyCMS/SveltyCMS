#!/usr/bin/env bun
/**
 * @file run-integration-tests.ts
 * @description Orchestrates integration tests using a local test configuration
 * This script:
 * 1. Checks for config/private.test.ts
 * 2. Runs the dev server and integration tests concurrently
 * 3. Cleans up resources when tests complete
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs'; // Removed writeFileSync, unlinkSync

const rootDir = join(import.meta.dir, '..');
const configPath = join(rootDir, 'config', 'private.test.ts');

let testProcess: ReturnType<typeof spawn> | null = null;
let previewProcess: ReturnType<typeof spawn> | null = null;

async function cleanup(exitCode: number = 0) {
	console.log('\n🧹 Cleaning up...');

	// Stop the test process if running
	if (testProcess) {
		testProcess.kill('SIGTERM');
	}

	// Stop the preview server if running
	if (previewProcess) {
		previewProcess.kill('SIGTERM');
	}

	console.log('✅ Cleanup complete');
	process.exit(exitCode);
}

// Handle termination signals
process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', (error) => {
	console.error('❌ Uncaught exception:', error);
	cleanup(1);
});

async function main() {
	try {
		console.log('🚀 Starting integration tests...\n');

		// Check for config/private.test.ts
		if (!existsSync(configPath)) {
			console.warn('⚠️  Warning: config/private.test.ts not found.');
			console.warn('   Integration tests require a test database configuration.');
			console.warn('   Please ensure you have configured a test database or that the app can initialize one.');
		} else {
			console.log('✅ Found config/private.test.ts');
		}

		// Build the app
		console.log('🔧 Building the app...');
		await new Promise<void>((resolve, reject) => {
			const build = spawn('bun', ['run', 'build'], {
				cwd: rootDir,
				stdio: 'inherit',
				shell: true,
				env: { ...process.env, TEST_MODE: 'true' }
			});
			build.on('close', (code) => {
				if (code === 0) resolve();
				else reject(new Error('Build failed'));
			});
		});

		// Start preview server on port 4173
		console.log('🚀 Starting preview server on port 4173...');
		previewProcess = spawn('bun', ['run', 'preview', '--port', '4173'], {
			cwd: rootDir,
			stdio: 'inherit',
			shell: true,
			env: { ...process.env, TEST_MODE: 'true' }
		});

		// Wait for preview server to be ready
		await waitForServer();
		// Small pause to ensure server is fully ready before seeding
		await new Promise((r) => setTimeout(r, 500));

		// Seed database using existing seed script
		// Note: We don't pass DB env vars here anymore, assuming config/private.test.ts handles connection
		// or that the user has set them in their environment if needed.
		console.log('🧪 Seeding test database...');
		await new Promise<void>((resolve, reject) => {
			const seed = spawn('bun', ['run', 'scripts/seed-test-db.ts'], {
				cwd: rootDir,
				stdio: 'inherit',
				shell: true,
				env: {
					...process.env,
					TEST_MODE: 'true',
					API_BASE_URL: 'http://localhost:4173'
				}
			});
			seed.on('close', (code) => {
				if (code === 0) resolve();
				else reject(new Error('Seed script failed'));
			});
		});

		// Run integration tests
		console.log('🧪 Starting integration tests...\n');
		testProcess = spawn('bun', ['run', 'test:integration:run'], {
			cwd: rootDir,
			stdio: 'inherit',
			shell: true,
			env: { ...process.env, TEST_MODE: 'true', API_BASE_URL: 'http://localhost:4173' }
		});

		testProcess.on('close', (code) => {
			cleanup(code || 0);
		});
	} catch (error) {
		console.error('❌ Error running integration tests:', error);
		cleanup(1);
	}
}

async function waitForServer() {
	const MAX_RETRIES = 30;
	const RETRY_DELAY = 1000;
	for (let i = 0; i < MAX_RETRIES; i++) {
		try {
			const res = await fetch('http://localhost:4173');
			if (res.ok || res.status === 404) {
				console.log('✅ Server is ready');
				return;
			}
		} catch (_) {}
		await new Promise((r) => setTimeout(r, RETRY_DELAY));
	}
	throw new Error('Server did not become ready in time');
}

main();
