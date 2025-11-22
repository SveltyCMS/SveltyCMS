/**
 * @file scripts/test-smart.ts
 * @description Intelligent test runner for local development
 *
 * CURRENT: Playwright E2E tests with MongoDB
 * FUTURE: Will support parallel testing with multiple databases:
 *   - MongoDB (current)
 *   - PostgreSQL (via Drizzle ORM)
 *   - MariaDB (via Drizzle ORM)
 *   - MySQL (via Drizzle ORM)
 *
 * This script is designed for LOCAL DEVELOPMENT ONLY.
 * For CI/CD, use the standard test:integration and test:e2e scripts.
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Configuration
const SERVER_URL = 'http://localhost:5173';
const CONFIG_PATH = resolve(process.cwd(), 'config/private.ts');

async function checkServer() {
	try {
		const response = await fetch(SERVER_URL);
		return true;
	} catch (e) {
		return false;
	}
}

async function main() {
	console.log('🔍 Checking environment...');
	const isServerRunning = await checkServer();
	let serverProcess;

	if (!isServerRunning) {
		console.log('🚀 Starting server for tests...');
		// Start server in background
		serverProcess = spawn('bun', ['run', 'dev'], {
			stdio: 'pipe', // Pipe output so we don't clutter unless needed
			detached: true
		});

		// Wait for server
		console.log('⏳ Waiting for server to be ready...');
		let retries = 60; // 60 seconds
		while (retries > 0) {
			if (await checkServer()) break;
			await new Promise((r) => setTimeout(r, 1000));
			retries--;
		}
		if (retries === 0) {
			console.error('❌ Server failed to start');
			if (serverProcess) process.kill(-serverProcess.pid);
			process.exit(1);
		}
		console.log('✅ Server is up!');
	} else {
		console.log('ℹ️ Server is already running');
	}

	const isConfigured = existsSync(CONFIG_PATH);
	console.log(`ℹ️ System is ${isConfigured ? 'CONFIGURED (DB Seeded)' : 'NOT CONFIGURED (Clean)'}`);

	// Determine which tests to run
	let testArgs = ['test'];

	if (!isConfigured) {
		console.log('⚠️ System not configured. Running ONLY setup wizard tests.');
		// Only run setup tests
		testArgs.push('tests/playwright/setup-wizard.spec.ts', 'tests/playwright/setup-wizard-errors.spec.ts');
	} else {
		console.log('✅ System configured. Running full test suite.');
		// Run all tests (setup tests will skip automatically due to our previous fix)
		testArgs.push('tests/playwright');
	}

	console.log(`▶️ Running: bun x playwright ${testArgs.join(' ')}`);

	const testProcess = spawn('bun', ['x', 'playwright', ...testArgs], {
		stdio: 'inherit',
		env: { ...process.env, CI: 'true' } // Ensure CI mode for consistent results
	});

	testProcess.on('close', (code) => {
		if (serverProcess) {
			console.log('🛑 Stopping temporary server...');
			try {
				process.kill(-serverProcess.pid);
			} catch (e) {
				// Ignore if already dead
			}
		}
		process.exit(code ?? 1);
	});
}

main();
