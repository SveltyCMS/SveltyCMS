#!/usr/bin/env bun
/**
 * @file scripts/setup-system.ts
 * @description Fast, non-browser setup for SveltyCMS during CI/Testing.
 * Directly calls SvelteKit Server Actions to configure database and admin.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:4173';
const rootDir = process.cwd();

/**
 * Helper to parse SvelteKit Server Action "devalue" serialization.
 */
function parseActionResult(result: any): any {
	if (result.type === 'success' && typeof result.data === 'string') {
		try {
			const parsed = JSON.parse(result.data);
			if (Array.isArray(parsed)) {
				const [structure, ...values] = parsed;
				if (typeof structure === 'object' && structure !== null) {
					const unmarshaler = (val: any): any => {
						if (typeof val === 'number') return values[val - 1];
						if (Array.isArray(val)) return val.map(unmarshaler);
						if (typeof val === 'object' && val !== null) {
							const obj: Record<string, any> = {};
							for (const [k, v] of Object.entries(val)) {
								obj[k] = unmarshaler(v);
							}
							return obj;
						}
						return val;
					};
					return unmarshaler(structure);
				}
				return values[0];
			}
		} catch (e) {
			console.warn('[parseActionResult] Failed to parse data:', e);
		}
	}
	return result.data;
}

async function postAction(actionName: string, formData: FormData) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30_000);
	try {
		const res = await fetch(`${API_BASE_URL}/setup?/${actionName}`, {
			method: 'POST',
			body: formData,
			signal: controller.signal,
			headers: {
				'x-sveltekit-action': 'true',
				Origin: API_BASE_URL
			}
		});
		if (!res.ok) {
			throw new Error(`Action ${actionName} failed with status ${res.status}`);
		}
		return await res.json();
	} finally {
		clearTimeout(timeout);
	}
}

async function main() {
	const dbType = process.env.DB_TYPE || 'sqlite';
	const dbHost = process.env.DB_HOST || '127.0.0.1';
	const dbPort = process.env.DB_PORT || (dbType === 'mariadb' ? '3306' : dbType === 'postgresql' ? '5432' : '27017');
	const dbName = process.env.DB_NAME || 'sveltycms_test';
	const dbUser = process.env.DB_USER || '';
	const dbPass = process.env.DB_PASSWORD || '';

	const dbConfig = {
		type: dbType,
		host: dbHost,
		port: Number(dbPort),
		name: dbName,
		user: dbUser,
		password: dbPass
	};

	console.log(`🚀 Starting system setup for ${dbType}...`);

	const multiTenant = process.env.MULTI_TENANT === 'true';
	const demoMode = process.env.DEMO === 'true';

	try {
		// 1. Test Database
		console.log('🔗 Testing database connection...');
		const testForm = new FormData();
		testForm.append('config', JSON.stringify(dbConfig));
		const testRes = await postAction('testDatabase', testForm);
		const testData = parseActionResult(testRes);

		if (!testData || testData.success === false) {
			throw new Error(`Database connection failed: ${testData?.error || 'Unknown error'}`);
		}
		console.log('✅ Database connection successful.');

		// 2. Seed Database
		console.log('🌱 Seeding database...');
		const seedForm = new FormData();
		seedForm.append('config', JSON.stringify(dbConfig));
		seedForm.append('system', JSON.stringify({ preset: 'blank' }));
		const seedRes = await postAction('seedDatabase', seedForm);
		const seedData = parseActionResult(seedRes);

		if (!seedData || seedData.success === false) {
			throw new Error(`Database seeding failed: ${seedData?.error || 'Unknown error'}`);
		}
		console.log('✅ Database seeding started.');

		// 3. Complete Setup (Create Admin)
		console.log(`👤 Creating admin user and completing setup (Multi-Tenant: ${multiTenant}, Demo: ${demoMode})...`);
		const completeForm = new FormData();
		const payload = {
			database: dbConfig,
			admin: {
				username: 'admin',
				email: 'admin@example.com',
				password: 'Admin123!',
				confirmPassword: 'Admin123!'
			},
			system: {
				multiTenant,
				demoMode,
				useRedis: process.env.USE_REDIS === 'true',
				siteName: 'SveltyCMS Test',
				defaultContentLanguage: 'en',
				contentLanguages: ['en'],
				defaultSystemLanguage: 'en',
				systemLanguages: ['en']
			}
		};
		completeForm.append('data', JSON.stringify(payload));
		const completeRes = await postAction('completeSetup', completeForm);
		const completeData = parseActionResult(completeRes);

		if (!completeData || completeData.success === false) {
			throw new Error(`Setup completion failed: ${completeData?.error || 'Unknown error'}`);
		}
		console.log('✅ Setup completed successfully! 🎉');

		// 4. Verification
		const configDir = join(rootDir, 'config');
		// Ensure config directory exists (may not exist in fresh CI clones)
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
			console.log('✅ Created config directory.');
		}

		const configName = process.env.TEST_MODE === 'true' ? 'private.test.ts' : 'private.ts';
		const configPath = join(configDir, configName);
		if (existsSync(configPath)) {
			console.log(`✅ Verified: ${configName} was created.`);
		} else {
			console.warn(`⚠️ Warning: ${configName} not found at expected path: ${configPath}`);
		}
	} catch (error) {
		console.error('❌ Setup failed:', error);
		process.exit(1);
	}
}

main();
