#!/usr/bin/env bun
/**
 * @file run-integration-tests.ts
 * @description Truly Black-Box Integration Test Runner
 * Uses /api/testing for state management. No internal imports allowed.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
let API_BASE_URL = (globalThis as any).process?.env?.API_BASE_URL || 'http://127.0.0.1:4173';
const pkgManager = (globalThis as any).process?.env?.npm_execpath || 'bun';

let previewProcess: ChildProcess | null = null;

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

		// 0. Clean up stale config
		const privateTestPath = join(rootDir, 'config', 'private.test.ts');
		if (existsSync(privateTestPath)) {
			console.log('🧹 Removing stale private.test.ts...');
			unlinkSync(privateTestPath);
		}

		// 1. Build & Start Server (Initial startup in setup mode)
		console.log('📦 Starting preview server for initial setup...');
		await startPreviewServer();

		// 1.5. Run Fast System Setup (Direct API calls, no browser)
		console.log('⚙️ Running Fast System Setup to configure system...');
		const dbType = (globalThis as any).process?.env?.DB_TYPE || 'sqlite';
		console.log(`📡 DB_TYPE: ${dbType}`);

		const setupResult = await new Promise<number>((resolve) => {
			const setupProc = spawn(pkgManager, ['run', 'scripts/setup-system.ts'], {
				cwd: rootDir,
				stdio: 'inherit',
				shell: true,
				env: {
					...(globalThis as any).process?.env,
					DB_TYPE: dbType,
					TEST_MODE: 'true',
					API_BASE_URL
				}
			});
			setupProc.on('close', resolve);
		});

		if (setupResult !== 0) {
			console.error('❌ Fast setup failed. Cannot proceed with integration tests.');
			await cleanup(1);
			return;
		}
		console.log('✅ System configured successfully via API.');

		// 1.6. RESTART SERVER to pick up new config/private.test.ts (CRITICAL for Black-Box)
		console.log('🔄 Restarting preview server to apply new configuration...');
		await startPreviewServer(); // restartPreviewServer logic integrated into startPreviewServer
		console.log('✅ Server restarted and ready.');

		// 2. Discover tests
		const args = process.argv.slice(2);
		const filterArg = args.find((arg) => arg.startsWith('--filter='));
		const dbFilter = filterArg ? filterArg.split('=')[1] : null;

		const testFiles = args.filter((arg) => !arg.startsWith('--'));
		let filesToRun = testFiles.length > 0 ? testFiles : findTestFiles(join(rootDir, 'tests/integration'));

		// 2.1. Filter files based on DB_TYPE if requested
		if (dbFilter) {
			console.log(`🔍 Applying filter: ${dbFilter}`);
			const otherDbs = ['mongodb', 'mariadb', 'postgresql', 'sqlite'].filter((db) => db !== dbFilter);

			filesToRun = filesToRun.filter((file) => {
				const lowerFile = file.toLowerCase();
				// If the filename contains another DB's name, skip it
				if (otherDbs.some((other) => lowerFile.includes(`${other}-adapter`) || lowerFile.includes(`${other}.test`))) {
					return false;
				}
				return true;
			});
		}

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

async function startPreviewServer() {
	if (previewProcess) {
		console.log('🛑 Killing existing preview process...');
		previewProcess.kill('SIGTERM');
		await new Promise((r) => setTimeout(r, 3000));
	}

	const port = '4173';
	API_BASE_URL = `http://127.0.0.1:${port}`;

	console.log('📦 Spawning preview server...');
	previewProcess = spawn(pkgManager, ['run', 'preview', '--port', port, '--host', '127.0.0.1'], {
		cwd: rootDir,
		stdio: 'inherit',
		shell: true,
		env: { ...(globalThis as any).process?.env, TEST_MODE: 'true' }
	});

	previewProcess.on('error', (err) => {
		console.error('❌ Failed to start preview process:', err);
	});

	// Poll for server readiness instead of parsing stdout (Vite 8 prints to stderr)
	await waitForServer();
}

async function checkServer() {
	try {
		const res = await fetch(`${API_BASE_URL}/api/system/health`, { redirect: 'manual' });
		return res.status > 0;
	} catch {
		return false;
	}
}

async function waitForServer() {
	console.log(`⏳ Waiting for server health check at ${API_BASE_URL}...`);
	for (let i = 0; i < 30; i++) {
		if (await checkServer()) {
			return;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('Server health check timeout');
}

async function resetAndSeed() {
	try {
		// Reset
		const resetRes = await fetch(`${API_BASE_URL}/api/testing`, {
			method: 'POST',
			body: JSON.stringify({ action: 'reset' }),
			headers: {
				'Content-Type': 'application/json',
				Origin: API_BASE_URL // Add Origin header to satisfy CSRF protection in hooks
			}
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
			headers: {
				'Content-Type': 'application/json',
				Origin: API_BASE_URL // Add Origin header to satisfy CSRF protection in hooks
			}
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
		const proc = spawn(pkgManager, ['test', file], {
			cwd: rootDir,
			stdio: 'inherit',
			env: { ...(globalThis as any).process?.env, TEST_MODE: 'true', API_BASE_URL }
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
		} else if (
			f.endsWith('.test.ts') &&
			!f.includes('setup-actions') &&
			!f.includes('setup-wizard.test.ts') &&
			!f.includes('setup-presets.test.ts')
		) {
			list.push(p);
		}
	}
	return list;
}

main();
