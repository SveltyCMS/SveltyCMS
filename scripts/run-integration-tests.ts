#!/usr/bin/env bun
/**
 * @file run-integration-tests.ts
 * @description Truly Black-Box Integration Test Runner
 * Uses /api/testing for state management. No internal imports allowed.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = join(import.meta.dir, '..');
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:4173';

let previewProcess: ReturnType<typeof spawn> | null = null;

async function cleanup(exitCode = 0) {
	console.log('\n🧹 Cleaning up test environment...');
	if (previewProcess) {
		previewProcess.kill('SIGTERM');
	}
	process.exit(exitCode);
}

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));

async function main() {
	try {
		console.log('🚀 Starting Black-Box Integration Suite...');

		// 1. Build & Start Server (Handled by CI normally, but support local run)
		const isAlreadyRunning = await checkServer();
		if (isAlreadyRunning) {
			console.log('✅ Server already running at', API_BASE_URL);
		} else {
			console.log('📦 Starting preview server with TEST_MODE=true...');
			previewProcess = spawn('bun', ['run', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
				cwd: rootDir,
				stdio: 'inherit',
				shell: true,
				env: { ...process.env, TEST_MODE: 'true' }
			});
			await waitForServer();
		}

		// 1.5. Run Setup Wizard via Playwright to generate config naturally (Black-Box)
		console.log('⚙️ Running Playwright Setup Wizard to configure system...');
		const setupResult = await new Promise<number>((resolve) => {
			const pwProcess = spawn('bun', ['x', 'playwright', 'test', 'tests/e2e/setup-wizard.spec.ts'], {
				cwd: rootDir,
				stdio: 'inherit',
				shell: true,
				env: {
					...process.env,
					DB_TYPE: process.env.DB_TYPE || 'mongodb',
					DB_HOST: process.env.DB_HOST || 'localhost',
					DB_NAME: process.env.DB_NAME || 'sveltycms_test',
					TEST_MODE: 'true'
				}
			});
			pwProcess.on('close', resolve);
		});

		if (setupResult !== 0) {
			console.error('❌ Playwright setup failed. Cannot proceed with integration tests.');
			await cleanup(1);
			return; // TS narrowing
		}
		console.log('✅ System configured successfully via UI.');

		// 2. Discover tests
		const testFiles = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
		const filesToRun = testFiles.length > 0 ? testFiles : findTestFiles(join(rootDir, 'tests/integration'));

		console.log(`🧪 Running ${filesToRun.length} test files sequentially...`);

		let failed = false;
		for (const file of filesToRun) {
			const relPath = relative(rootDir, file);
			console.log(`\n▶️  [TEST] ${relPath}`);

			// Reset & Seed via God-Mode API
			const setupOk = await resetAndSeed();
			if (!setupOk) {
				console.error('❌ Failed to reset/seed via API. Aborting.');
				failed = true;
				break;
			}

			// Run Bun test
			const code = await runTest(file);
			if (code !== 0) {
				console.error(`❌ Failed: ${relPath}`);
				failed = true;
				// Continue to next test unless it's a critical failure
			} else {
				console.log(`✅ Passed: ${relPath}`);
			}
		}

		cleanup(failed ? 1 : 0);
	} catch (error) {
		console.error('❌ Runner Error:', error);
		cleanup(1);
	}
}

async function checkServer() {
	try {
		const res = await fetch(`${API_BASE_URL}/api/system/health`);
		return res.ok;
	} catch {
		return false;
	}
}

async function waitForServer() {
	console.log(`⏳ Waiting for server at ${API_BASE_URL}...`);
	for (let i = 0; i < 60; i++) {
		if (i % 10 === 0 && i > 0) {
			console.log(`...still waiting (${i}s)`);
		}
		if (await checkServer()) {
			console.log('✅ Server is up and healthy!');
			return;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('Server timeout');
}

async function resetAndSeed() {
	try {
		// Reset
		const resetRes = await fetch(`${API_BASE_URL}/api/testing`, {
			method: 'POST',
			body: JSON.stringify({ action: 'reset' }),
			headers: { 'Content-Type': 'application/json' }
		});
		if (!resetRes.ok) {
			console.error(`❌ Reset failed: ${resetRes.status} ${resetRes.statusText}`);
			const body = await resetRes.text();
			console.error(`Body: ${body}`);
			return false;
		}

		// Seed
		const seedRes = await fetch(`${API_BASE_URL}/api/testing`, {
			method: 'POST',
			body: JSON.stringify({ action: 'seed' }),
			headers: { 'Content-Type': 'application/json' }
		});
		if (!seedRes.ok) {
			console.error(`❌ Seed failed: ${seedRes.status} ${seedRes.statusText}`);
			const body = await seedRes.text();
			console.error(`Body: ${body}`);
			return false;
		}

		return true;
	} catch (e) {
		console.error('[Runner] Setup error:', e);
		return false;
	}
}

function runTest(file: string): Promise<number> {
	return new Promise((resolve) => {
		const proc = spawn('bun', ['test', file], {
			cwd: rootDir,
			stdio: 'inherit',
			env: { ...process.env, TEST_MODE: 'true', API_BASE_URL }
		});
		proc.on('close', (code) => resolve(code || 0));
	});
}

function findTestFiles(dir: string, list: string[] = []) {
	if (!existsSync(dir)) {
		return list;
	}
	const files = readdirSync(dir);
	for (const f of files) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) {
			findTestFiles(p, list);
		} else if (f.endsWith('.test.ts') && !f.includes('setup-actions')) {
			list.push(p);
		}
	}
	return list;
}

main();
