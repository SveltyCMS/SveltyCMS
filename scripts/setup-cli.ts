/**
 * @file scripts/setup-cli.ts
 * @description CLI-based setup wizard for SveltyCMS
 * Usage: bun scripts/setup-cli.ts
 */

import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';

// Interface for DB Config
interface DatabaseConfig {
	type: string;
	host: string;
	port: number;
	name: string;
	user?: string;
	password?: string;
}

// Interface for Admin Config
interface AdminConfig {
	username: string;
	email: string;
	password: string;
}

const rl = createInterface({ input, output });

async function ask(question: string, defaultValue?: string): Promise<string> {
	const answer = await rl.question(`${question} ${defaultValue ? `(${defaultValue})` : ''}: `);
	return answer.trim() || defaultValue || '';
}

async function askSecret(question: string): Promise<string> {
	// Simple masking is hard with just readline, so we'll just ask standardly
	// Ideally we'd use a library like 'prompts' but we want zero extra deps
	return await ask(question);
}

async function main() {
	console.log('━'.repeat(60));
	console.log('  🚀 SveltyCMS CLI Setup Wizard');
	console.log('  This tool will configure your database and create an admin user.');
	console.log('━'.repeat(60));

	const workspaceRoot = process.cwd();
	const configPath = path.resolve(workspaceRoot, 'config/private.ts');
	const markerPath = path.resolve(workspaceRoot, 'config/.setup-complete');

	if (existsSync(configPath) && existsSync(markerPath)) {
		console.log('\n✅ Setup is already complete (config/private.ts and .setup-complete exist).');
		const redo = await ask('Do you want to re-run setup? (y/N)', 'N');
		if (redo.toLowerCase() !== 'y') {
			rl.close();
			return;
		}
	}

	// --- Step 1: Database Configuration ---
	console.log('\n📦 Database Configuration');
	const dbType = await ask('Database Type (mongodb/mariadb/postgres/mysql)', 'mongodb');
	const dbHost = await ask('Database Host', 'localhost');
	const dbPortStr = await ask('Database Port', dbType === 'mongodb' ? '27017' : '3306');
	const dbPort = parseInt(dbPortStr, 10);
	const dbName = await ask('Database Name', 'sveltycms');
	const dbUser = await ask('Database User (optional)', '');
	const dbPassword = await askSecret('Database Password (optional)');

	const dbConfig: DatabaseConfig = {
		type: dbType,
		host: dbHost,
		port: dbPort,
		name: dbName,
		user: dbUser,
		password: dbPassword
	};

	// --- Step 2: Admin User Configuration ---
	console.log('\n👤 Admin User Configuration');
	const username = await ask('Admin Username', 'admin');
	const email = await ask('Admin Email', 'admin@example.com');
	const password = await askSecret('Admin Password');

	if (password.length < 8) {
		console.error('❌ Password must be at least 8 characters.');
		rl.close();
		return;
	}

	const adminConfig: AdminConfig = { username, email, password };

	// --- Step 3: Write Config ---
	console.log('\n📝 Generating configuration...');

	const jwtSecret = randomBytes(32).toString('base64');
	const encryptionKey = randomBytes(32).toString('base64');

	const privateConfigContent = `
/**
 * @file config/private.ts
 * @description Private configuration file containing essential bootstrap variables.
 * These values are required for the server to start and connect to the database.
 * This file was populated during the initial setup process.
 */

export const privateEnv = {
	// --- Core Database Connection ---
	DB_TYPE: '${dbConfig.type}',
	DB_HOST: '${dbConfig.host}',
	DB_PORT: ${dbConfig.port},
	DB_NAME: '${dbConfig.name}',
	DB_USER: '${dbConfig.user || ''}',
	DB_PASSWORD: '${dbConfig.password || ''}',

	// --- Connection Behavior ---
	DB_RETRY_ATTEMPTS: 5,
	DB_RETRY_DELAY: 3000,

	// --- Core Security Keys ---
	JWT_SECRET_KEY: '${jwtSecret}',
	ENCRYPTION_KEY: '${encryptionKey}',

	// --- Fundamental Architectural Mode ---
	MULTI_TENANT: false,
};
`;

	await writeFile(configPath, privateConfigContent, 'utf-8');
	console.log('✅ Wrote config/private.ts');

	// --- Step 4: Initialize & Seed ---
	console.log('\n🌱 Initializing database and seeding data...');

	try {
		// Import shared utilities (using dynamic import to pick up new config/paths if needed)
		// Note: We need to use the relative paths that 'bun' can resolve based on tsconfig
		const { getSetupDatabaseAdapter } = await import('../apps/setup/src/routes/api/utils');
		const { initSystemFromSetup } = await import('@shared/database/seed');
		const { Auth } = await import('@shared/database/auth');
		const { getDefaultSessionStore } = await import('@shared/database/auth/sessionManager');

		// Create adapter
		const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);

		// Run Migrations (MariaDB only for now, mirroring api/seed/+server.ts)
		if (dbConfig.type === 'mariadb') {
			console.log('🐘 Running MariaDB migrations...');
			const { runMigrations } = await import('@shared/database/mariadb/migrations');
			// @ts-ignore
			if (dbAdapter.pool) {
				// @ts-ignore
				const res = await runMigrations(dbAdapter.pool);
				if (!res.success) throw new Error(res.error);
			}
		}

		// Seed System
		console.log('   Seeding default collections, settings, and themes...');
		await initSystemFromSetup(dbAdapter);
		console.log('✅ System seeded.');

		// Create Admin
		console.log('   Creating admin user...');
		const auth = new Auth(dbAdapter, getDefaultSessionStore());

		const result = await auth.createUserAndSession(
			{
				username: adminConfig.username,
				email: adminConfig.email,
				password: adminConfig.password,
				role: 'admin',
				isRegistered: true
			},
			{ expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
		);

		if (!result.success) {
			throw new Error(result.error?.message || 'Failed to create admin');
		}

		console.log('✅ Admin user created.');

		// Write Marker
		await writeFile(markerPath, new Date().toISOString(), 'utf-8');
		console.log('✅ Completion marker written.');
	} catch (error) {
		console.error('\n❌ Setup Failed:', error);
		console.log('\n⚠️  Cleaning up config...');
		try {
			// await unlink(configPath); // Optional: keep it for debugging?
		} catch {}
		rl.close();
		process.exit(1);
	}

	console.log('\n' + '━'.repeat(60));
	console.log('🎉 Setup Complete!');
	console.log('   Run "bun dev" to start the CMS.');
	console.log('━'.repeat(60));

	rl.close();
}

main().catch((err) => {
	console.error('Fatal Error:', err);
	rl.close();
});
