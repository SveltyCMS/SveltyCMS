/**
 * @file scripts/smart-dev.ts
 * @description Smart development server for SveltyCMS Nx Monorepo
 * @summary
 * - Detects config/private.ts to determine which app to run
 * - Watches for setup completion and auto-switches to CMS
 * - Uses Nx executors for optimal caching and performance
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync, watch } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';

const CONFIG_PATH = path.resolve(process.cwd(), 'config/private.ts');
const MARKER_PATH = path.resolve(process.cwd(), 'config/.setup-complete');
const CONFIG_DIR = path.resolve(process.cwd(), 'config');

let currentChild: ChildProcess | null = null;
let isShuttingDown = false;
let isIntentionalShutdown = false;
let watcher: ReturnType<typeof watch> | null = null;

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const net = require('net');
		const server = net.createServer();

		server.once('error', () => resolve(false));
		server.once('listening', () => {
			server.close();
			resolve(true);
		});

		server.listen(port);
	});
}

/**
 * Wait for a port to become available (with timeout)
 */
async function waitForPort(port: number, maxWaitMs = 5000): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < maxWaitMs) {
		if (await isPortAvailable(port)) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	return false;
}

/**
 * Start an Nx workspace app
 */
function startApp(app: 'setup' | 'cms') {
	const PORT = process.env.PORT || 5173;
	const ports = { setup: PORT, cms: PORT };

	console.log('━'.repeat(60));
	console.log(`  🚀 SveltyCMS ${app.toUpperCase()}`);
	console.log(`  📍 http://localhost:${ports[app]}`);
	console.log('━'.repeat(60));

	// Use Nx to run the dev target
	currentChild = spawn('nx', ['dev', app], {
		cwd: process.cwd(),
		stdio: 'inherit',
		env: { ...process.env, FORCE_COLOR: '1' }
	});

	currentChild.on('error', (err) => {
		if (!isShuttingDown) {
			console.error(`❌ Failed to start ${app}:`, err.message);
		}
	});

	currentChild.on('exit', (code, signal) => {
		if (!isShuttingDown && !isIntentionalShutdown && code !== 0 && code !== null) {
			console.log(`\n⚠️  ${app} exited with code ${code} (signal: ${signal || 'none'})`);
		}
	});
}

/**
 * Stop the current app gracefully
 */
function stopCurrentApp(): Promise<void> {
	return new Promise((resolve) => {
		if (!currentChild) {
			resolve();
			return;
		}

		// If already exited, resolve immediately
		if (currentChild.exitCode !== null || currentChild.signalCode !== null) {
			currentChild = null;
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			if (currentChild && !currentChild.killed) {
				currentChild.kill('SIGKILL');
			}
			resolve();
		}, 2000); // Reduce timeout to 2s for snappier feel

		currentChild.once('exit', () => {
			clearTimeout(timeout);
			currentChild = null;
			resolve();
		});

		// Send SIGTERM to allow graceful child shutdown
		currentChild.kill('SIGTERM');
	});
}

/**
 * Watch for setup completion and auto-switch to CMS
 */
function watchForCompletion() {
	if (!existsSync(CONFIG_DIR)) {
		console.warn('⚠️  Config directory does not exist yet, watching parent...');
	}

	watcher = watch(CONFIG_DIR, async (eventType, filename) => {
		// Look for private.ts creation
		if (filename === 'private.ts' && eventType === 'rename' && existsSync(CONFIG_PATH)) {
			// Check for completion marker
			const hasMarker = existsSync(MARKER_PATH);

			if (hasMarker) {
				console.log('\n' + '━'.repeat(60));
				console.log('  ✅ Setup Complete!');
				console.log('  🔄 Switching to CMS...');
				console.log('━'.repeat(60) + '\n');

				// Wait for API response to flush to client
				console.log('⏳ Waiting for API response to flush...');
				await new Promise((resolve) => setTimeout(resolve, 2000));

				// Stop watching
				watcher?.close();
				watcher = null;

				// Clean up marker
				await unlink(MARKER_PATH).catch(() => {});

				// Switch to CMS
				await stopCurrentApp();

				// Wait for port to be available before starting CMS
				const PORT = process.env.PORT || 5173;
				console.log(`⏳ Waiting for port ${PORT} to be available...`);
				const portReady = await waitForPort(Number(PORT), 5000);

				if (!portReady) {
					console.warn(`⚠️  Port ${PORT} still in use after 5s - CMS may fail to start`);
				}

				setTimeout(() => startApp('cms'), 500);
			}
		}
	});
}

/**
 * Main entry point
 */
async function main() {
	const args = process.argv.slice(2);
	const forceMode = args[0] as 'setup' | 'cms' | undefined;

	// Allow forcing a specific mode for debugging
	if (forceMode === 'setup' || forceMode === 'cms') {
		console.log(`🔧 Force mode: ${forceMode}`);
		startApp(forceMode);
		return;
	}

	// Check for existing config
	const hasConfig = existsSync(CONFIG_PATH);

	if (!hasConfig) {
		console.log('⚙️  No configuration found');
		console.log('📝 Starting Setup Wizard...\n');

		// Start setup and watch for completion
		startApp('setup');
		watchForCompletion();
	} else {
		console.log('✅ Configuration found');
		console.log('🚀 Starting CMS...\n');
		startApp('cms');
	}
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown() {
	if (isShuttingDown) return;
	isShuttingDown = true;
	isIntentionalShutdown = true;

	console.log(`\n👋 Shutting down...`);

	// Stop watching
	if (watcher) {
		watcher.close();
		watcher = null;
	}

	// Stop current app
	await stopCurrentApp();

	process.exit(0);
}

// Signal handlers
process.on('SIGINT', () => gracefulShutdown());
process.on('SIGTERM', () => gracefulShutdown());

// Handle orphan cleanups
process.on('exit', () => {
	if (currentChild && !currentChild.killed) {
		currentChild.kill('SIGKILL');
	}
});

// Run
main().catch((err) => {
	console.error('❌ Fatal error:', err);
	process.exit(1);
});
