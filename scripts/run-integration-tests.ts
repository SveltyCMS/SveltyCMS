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
import { join, relative } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

const rootDir = join(import.meta.dir, '..');
const configPath = join(rootDir, 'config', 'private.test.ts');

const testProcess: ReturnType<typeof spawn> | null = null;
let previewProcess: ReturnType<typeof spawn> | null = null;

// Restoration removed to avoid risk to live config
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

		// Determine which tests to run
		const testFiles = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
		const hasSetupTest = testFiles.length === 0 || testFiles.some((f) => f.includes('setup') || f.includes('api'));

		let initialDbConfig = {
			DB_TYPE: process.env.DB_TYPE || 'mongodb',
			DB_HOST: process.env.DB_HOST || '127.0.0.1',
			DB_PORT: parseInt(process.env.DB_PORT || '27017'),
			DB_NAME: process.env.DB_NAME || 'sveltycms_test',
			DB_USER: process.env.DB_USER,
			DB_PASSWORD: process.env.DB_PASSWORD
		};

		// 1. Check for existing test config to get credentials
		if (existsSync(configPath)) {
			console.log('📄 Found config/private.test.ts - Reading credentials...');
			// We import it to get the values
			// Note: We use a dynamic import with cache busting might be needed if re-running in same process,
			// but for first load it's fine.
			const config = await import(configPath);
			const env = config.privateEnv;

			initialDbConfig = {
				...initialDbConfig,
				DB_TYPE: env.DB_TYPE || initialDbConfig.DB_TYPE,
				DB_HOST: env.DB_HOST || initialDbConfig.DB_HOST,
				DB_PORT: env.DB_PORT || initialDbConfig.DB_PORT,
				DB_NAME: env.DB_NAME || initialDbConfig.DB_NAME,
				DB_USER: env.DB_USER || initialDbConfig.DB_USER,
				DB_PASSWORD: env.DB_PASSWORD || initialDbConfig.DB_PASSWORD
			};
		}

		// 2. Validate Credentials (safety check)
		// We explicitly require DB_USER/DB_PASSWORD if NOT using default localhost without auth?
		// But actually, for safety, if the user hasn't provided config, we shouldn't guess.
		// However, CI might use env vars.
		// If both private.test.ts AND env vars are missing, we should probably warn or fail?
		// For now, we proceed, but we log what we are using.
		console.log('⚙️  Test Database Configuration:');
		console.log(`   Host: ${initialDbConfig.DB_HOST}:${initialDbConfig.DB_PORT}`);
		console.log(`   Name: ${initialDbConfig.DB_NAME}`);
		console.log(`   User: ${initialDbConfig.DB_USER || '(none)'}`);
		console.log(`   Pass: ${initialDbConfig.DB_PASSWORD ? '******' : '(none)'}`);

		// 3. Cleanup for Setup Tests
		if (hasSetupTest && existsSync(configPath)) {
			console.log('🧹 Cleaning up persistent config for fresh setup test...');
			try {
				await import('fs/promises').then((fs) => fs.unlink(configPath));
				console.log('✅ Removed config/private.test.ts');
			} catch (e) {
				console.error('⚠️ Failed to remove config/private.test.ts:', e);
			}
		}

		// 4. Prepare Environment
		// We use the initial credentials for the setup test (so it can connect)
		// AND for the defaults if file doesn't exist yet.
		let privateEnv: any = initialDbConfig;

		// Start preview server on port 4173
		console.log('🚀 Starting preview server on port 4173...');
		previewProcess = spawn('bun', ['run', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
			cwd: rootDir,
			stdio: 'inherit', // Show server logs for debugging
			shell: true,
			env: { ...process.env, TEST_MODE: 'true' }
		});

		// Wait for preview server to be ready
		await waitForServer();
		// Small pause to ensure server is fully ready
		await new Promise((r) => setTimeout(r, 500));

		process.env.TELEMETRY_ENDPOINT = 'http://localhost:9999'; // Prevent real telemetry calls

		// Run integration tests
		console.log('🧪 Starting integration tests...\n');

		const testEnv = {
			...process.env,
			TEST_MODE: 'true',
			API_BASE_URL: 'http://localhost:4173',
			// Inject DB config variables
			DB_TYPE: privateEnv.DB_TYPE || 'mongodb',
			DB_HOST: (privateEnv.DB_HOST === 'localhost' ? '127.0.0.1' : privateEnv.DB_HOST) || '127.0.0.1',
			DB_PORT: (privateEnv.DB_PORT || 27017).toString(),
			DB_NAME: privateEnv.DB_NAME || 'sveltycms_test',
			DB_USER: privateEnv.DB_USER || 'admin',
			DB_PASSWORD: privateEnv.DB_PASSWORD || 'password',
			PUBLIC_DISABLE_TELEMETRY: 'true',
			NODE_ENV: 'test'
		};

		// Phase 1: Run Setup Test
		console.log('🟢 Phase 1: Setup API Test');
		// Helper to wait for server
		// (Removed unused checkServer function)

		const setupArgs = ['test', '--timeout', '15000', '--preload', './tests/bun/setup.ts', 'tests/bun/api/setup-actions.test.ts'];

		await new Promise<void>((resolve, reject) => {
			const setupProcess = spawn('bun', setupArgs, {
				cwd: rootDir,
				stdio: 'inherit',
				shell: false,
				env: testEnv
			});
			setupProcess.on('close', (code) => {
				if (code === 0) resolve();
				else reject(new Error(`Setup tests failed with code ${code}`));
			});
		});

		// RELOAD CONFIG: Phase 1 (Setup) likely created config/private.test.ts with new credentials.
		// We must reload it to ensure Phase 2 uses the correct DB_PASSWORD.
		if (existsSync(configPath)) {
			console.log('🔄 Reloading config/private.test.ts after Setup Phase...');
			// Use cache busting to ensure we get the fresh file
			const configUrl = `${configPath}?t=${Date.now()}`;
			const newConfig = await import(configUrl);
			const newPrivateEnv = newConfig.privateEnv;

			// Update testEnv with new values
			Object.assign(testEnv, {
				DB_TYPE: newPrivateEnv.DB_TYPE,
				DB_HOST: newPrivateEnv.DB_HOST,
				DB_PORT: newPrivateEnv.DB_PORT.toString(),
				DB_NAME: newPrivateEnv.DB_NAME,
				DB_USER: newPrivateEnv.DB_USER,
				DB_PASSWORD: newPrivateEnv.DB_PASSWORD
			});
			// Update local privateEnv reference too
			privateEnv = newPrivateEnv;
			console.log('✅ Config reloaded. DB_PASSWORD updated.');
		}

		// Phase 2: Run Main Suite

		// Helper to find all test files recursively
		function findTestFiles(dir: string, fileList: string[] = []) {
			const files = readdirSync(dir);
			for (const file of files) {
				const filePath = join(dir, file);
				const stat = statSync(filePath);
				if (stat.isDirectory()) {
					findTestFiles(filePath, fileList);
				} else if (file.endsWith('.test.ts') || file.endsWith('.test.js')) {
					fileList.push(filePath);
				}
			}
			return fileList;
		}

		// Find all tests in tests/bun/api and tests/bun/databases
		const allTestFiles = [...findTestFiles(join(rootDir, 'tests/bun/api')), ...findTestFiles(join(rootDir, 'tests/bun/databases'))];

		// Exclude setup.test.ts
		const mainSuiteFiles = allTestFiles.filter((f) => !f.endsWith('setup.test.ts'));

		// Check if we have tests to run
		if (mainSuiteFiles.length === 0) {
			console.log('⚠️ No tests found for Main Integration Suite.');
			cleanup(0);
			return;
		}

		// Run main suite tests sequentially to avoid DB contention/cleanup race conditions
		console.log(`\n🧪 Phase 2: Main Integration Suite (${mainSuiteFiles.length} test files)`);

		let passed = 0;
		let failed = 0;

		// We need to manage the preview server manually in the loop
		// First, kill the existing preview server from startup (if any)
		if (previewProcess) {
			previewProcess.kill('SIGTERM');
			previewProcess = null;
			// Wait for port release
			await new Promise((r) => setTimeout(r, 1000));
		}

		for (const file of mainSuiteFiles) {
			const relativePath = relative(rootDir, file);
			console.log(`\n🔄 [${passed + failed + 1}/${mainSuiteFiles.length}] Preparing: ${relativePath}`);

			try {
				// 1. Clean DB (Drop)
				const { MongoClient } = await import('mongodb');
				const dbUrl = privateEnv.DB_USER
					? `mongodb://${privateEnv.DB_USER}:${privateEnv.DB_PASSWORD}@${privateEnv.DB_HOST}:${privateEnv.DB_PORT}/${privateEnv.DB_NAME}?authSource=admin`
					: `mongodb://${privateEnv.DB_HOST}:${privateEnv.DB_PORT}/${privateEnv.DB_NAME}`;
				const client = new MongoClient(dbUrl);
				await client.connect();
				await client.db(privateEnv.DB_NAME).dropDatabase();
				await client.close();

				// 2. Seed DB (via script)
				await new Promise<void>((resolve, reject) => {
					const seedProcess = spawn('bun', ['run', 'tests/bun/scripts/seed.ts'], { cwd: rootDir, stdio: 'inherit' });
					seedProcess.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Seed failed'))));
				});

				// 3. Start Server
				previewProcess = spawn('bun', ['run', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
					cwd: rootDir,
					stdio: 'ignore', // Keep quiet
					shell: true,
					env: {
						...testEnv, // Use testEnv which has generic vars
						// Force cache disable via extremely low TTLs if possible, or reliance on restart
						CACHE_TTL_API: '1',
						CACHE_TTL_SCHEMA: '1'
					}
				});
				// Wait for server
				await waitForServer();

				// 4. Run Test
				console.log(`🏃 Running Test: ${relativePath}`);
				await new Promise<void>((resolve, reject) => {
					const runProcess = spawn('bun', ['test', '--timeout', '20000', '--preload', './tests/bun/setup.ts', file], {
						cwd: rootDir,
						stdio: 'inherit',
						shell: false,
						env: testEnv
					});
					runProcess.on('close', (code) => {
						if (code === 0) {
							passed++;
							resolve();
						} else {
							failed++;
							reject(new Error(`Test failed: ${relativePath}`));
						}
					});
				});

				// 5. Stop Server
				if (previewProcess) previewProcess.kill('SIGTERM');
				await new Promise((r) => setTimeout(r, 500)); // Grace period
			} catch (e) {
				console.error(`❌ Failed: ${relativePath}`, (e as Error).message);
				failed++;
				// Stop the preview server and continue to the next test
				if (previewProcess) previewProcess.kill('SIGTERM');
				await new Promise((r) => setTimeout(r, 500));
			}
		}

		console.log(`\n🏁 Main Suite Complete: ${passed} passed, ${failed} failed`);
		cleanup(failed > 0 ? 1 : 0);
		return;
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
			// Use curl to check if port is open and responding
			// -v to see handshake, -o /dev/null to discard body
			// We only care if connection succeeds (exit code 0)
			const proc = spawn('curl', ['-v', '-o', '/dev/null', 'http://127.0.0.1:4173'], { stdio: 'inherit' });
			const exitCode = await new Promise((resolve) => proc.on('close', resolve));

			if (exitCode === 0) {
				console.log('✅ Server is ready (curl success)');
				return;
			}
			console.log(`[WAIT] Curl exit code: ${exitCode}`);
		} catch (e) {
			console.error(`[WAIT] Error: ${(e as Error).message}`);
		}
		await new Promise((r) => setTimeout(r, RETRY_DELAY));
	}
	throw new Error('Server did not become ready in time');
}

main();
