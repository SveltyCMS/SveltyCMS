#!/usr/bin/env bun
/**
 * @file run-integration-tests.ts
 * @description Orchestrates integration tests with an in-memory MongoDB instance
 * This script:
 * 1. Starts a MongoMemoryServer instance
 * 2. Generates config/private.ts with the dynamic connection details
 * 3. Runs the dev server and integration tests concurrently
 * 4. Cleans up resources when tests complete
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(import.meta.dir, '..');
const configPath = join(rootDir, 'config', 'private.test.ts');

let mongoServer: MongoMemoryServer | null = null;
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

	// Stop MongoDB
	if (mongoServer) {
		console.log('Stopping MongoDB Memory Server...');
		await mongoServer.stop();
	}

	// Remove test config
	try {
		const { unlinkSync, existsSync } = await import('fs');
		if (existsSync(configPath)) {
			unlinkSync(configPath);
			console.log('🗑️  Removed config/private.test.ts');
		}
	} catch (e) {
		console.error('Failed to remove test config:', e);
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
		console.log('🚀 Starting in-memory MongoDB for integration tests...\n');

		// Start MongoDB Memory Server
		mongoServer = await MongoMemoryServer.create({
			instance: {
				dbName: 'sveltycms_test',
				port: undefined // Auto-assign port
			}
		});

		const uri = mongoServer.getUri();
		const port = mongoServer.instanceInfo?.port || 27017;

		console.log(`✅ MongoDB Memory Server started`);
		console.log(`   URI: ${uri}`);
		console.log(`   Port: ${port}\n`);

		// Generate config/private.test.ts
		console.log('📝 Generating config/private.test.ts...');
		const configContent = `export const privateEnv = {
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: ${port},
	DB_NAME: 'sveltycms_test',
	DB_USER: '',
	DB_PASSWORD: '',
	JWT_SECRET_KEY: 'test-secret-key-minimum-32-chars-long!!',
	ENCRYPTION_KEY: 'test-encryption-key-minimum-32-chars!!',
	GOOGLE_CLIENT_ID: '',
	GOOGLE_CLIENT_SECRET: '',
	MULTI_TENANT: false
} as const;
`;

		writeFileSync(configPath, configContent, 'utf-8');
		console.log(`✅ Generated ${configPath}\n`);

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
		console.log('🧪 Seeding test database...');
		await new Promise<void>((resolve, reject) => {
			const seed = spawn('bun', ['run', 'scripts/seed-test-db.ts'], {
				cwd: rootDir,
				stdio: 'inherit',
				shell: true,
				env: {
					...process.env,
					TEST_MODE: 'true',
					DB_PORT: port.toString(),
					DB_NAME: 'sveltycms_test',
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
