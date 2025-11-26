#!/usr/bin/env bun
/**
 * @file scripts/test-setup-flow.ts
 * @description Test script to validate setup flow logic
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), 'config', 'private.ts');
const BACKUP_PATH = join(process.cwd(), 'config', 'private.backup.test.ts');

// Colors for output
const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m'
};

function log(message: string, color: string = colors.reset) {
	console.log(`${color}${message}${colors.reset}`);
}

function testConfigValidation(scenario: string, configContent: string, expectedValid: boolean) {
	// Test the same logic as handleSetup.ts
	const hasValidJwtSecret = configContent.includes('JWT_SECRET_KEY') && !/JWT_SECRET_KEY:\s*["'`]{2}/.test(configContent);
	const hasValidDbHost = configContent.includes('DB_HOST') && !/DB_HOST:\s*["'`]{2}/.test(configContent);
	const hasValidDbName = configContent.includes('DB_NAME') && !/DB_NAME:\s*["'`]{2}/.test(configContent);

	const configHasValues = hasValidJwtSecret && hasValidDbHost && hasValidDbName;

	const passed = configHasValues === expectedValid;

	log(`\n${scenario}:`, passed ? colors.green : colors.red);
	log(`  JWT_SECRET valid: ${hasValidJwtSecret}`);
	log(`  DB_HOST valid: ${hasValidDbHost}`);
	log(`  DB_NAME valid: ${hasValidDbName}`);
	log(`  Overall: ${configHasValues} (expected: ${expectedValid})`);
	log(`  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`, passed ? colors.green : colors.red);

	return passed;
}

async function main() {
	log('\n🧪 Testing Setup Flow Logic\n', colors.blue);

	// Backup existing config if present
	if (existsSync(CONFIG_PATH)) {
		log('📦 Backing up existing config...', colors.yellow);
		const backup = readFileSync(CONFIG_PATH, 'utf8');
		writeFileSync(BACKUP_PATH, backup);
	}

	const tests = [
		{
			name: 'Empty config (Vite initial creation)',
			content: `
export const privateEnv = createPrivateConfig({
	DB_TYPE: 'mongodb',
	DB_HOST: '',
	DB_PORT: 27017,
	DB_NAME: '',
	DB_USER: '',
	DB_PASSWORD: '',
	JWT_SECRET_KEY: '',
	ENCRYPTION_KEY: '',
	MULTI_TENANT: false,
});
`,
			shouldBeValid: false
		},
		{
			name: 'Partial config (only JWT filled)',
			content: `
export const privateEnv = createPrivateConfig({
	DB_TYPE: 'mongodb',
	DB_HOST: '',
	DB_PORT: 27017,
	DB_NAME: '',
	DB_USER: '',
	DB_PASSWORD: '',
	JWT_SECRET_KEY: 'my-secret-key-12345',
	ENCRYPTION_KEY: '',
	MULTI_TENANT: false,
});
`,
			shouldBeValid: false
		},
		{
			name: 'Complete config (all required fields)',
			content: `
export const privateEnv = createPrivateConfig({
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'sveltycms',
	DB_USER: 'admin',
	DB_PASSWORD: 'password123',
	JWT_SECRET_KEY: 'my-secret-key-12345',
	ENCRYPTION_KEY: 'my-encryption-key',
	MULTI_TENANT: false,
});
`,
			shouldBeValid: true
		},
		{
			name: 'Config with template/placeholder values',
			content: `
export const privateEnv = createPrivateConfig({
	DB_TYPE: 'mongodb',
	DB_HOST: 'your-db-host-here',
	DB_PORT: 27017,
	DB_NAME: 'your-database-name',
	DB_USER: '',
	DB_PASSWORD: '',
	JWT_SECRET_KEY: 'generate-a-secret-key',
	ENCRYPTION_KEY: '',
	MULTI_TENANT: false,
});
`,
			shouldBeValid: true // Has non-empty values
		}
	];

	let passedTests = 0;
	let totalTests = tests.length;

	for (const test of tests) {
		const passed = testConfigValidation(test.name, test.content, test.shouldBeValid);
		if (passed) passedTests++;
	}

	// Test edge cases
	log('\n📋 Edge Cases:\n', colors.blue);

	const edgeCases = [
		{
			name: 'Config with single quotes',
			content: "JWT_SECRET_KEY: 'secret', DB_HOST: 'localhost', DB_NAME: 'db'",
			shouldBeValid: true
		},
		{
			name: 'Config with double quotes',
			content: 'JWT_SECRET_KEY: "secret", DB_HOST: "localhost", DB_NAME: "db"',
			shouldBeValid: true
		},
		{
			name: 'Config with backticks',
			content: 'JWT_SECRET_KEY: `secret`, DB_HOST: `localhost`, DB_NAME: `db`',
			shouldBeValid: true
		},
		{
			name: 'Empty single quotes',
			content: "JWT_SECRET_KEY: '', DB_HOST: '', DB_NAME: ''",
			shouldBeValid: false
		},
		{
			name: 'Empty double quotes',
			content: 'JWT_SECRET_KEY: "", DB_HOST: "", DB_NAME: ""',
			shouldBeValid: false
		}
	];

	for (const test of edgeCases) {
		const passed = testConfigValidation(test.name, test.content, test.shouldBeValid);
		if (passed) passedTests++;
		totalTests++;
	}

	// Summary
	log('\n' + '='.repeat(50), colors.blue);
	log(`\nTest Results: ${passedTests}/${totalTests} passed`, passedTests === totalTests ? colors.green : colors.red);

	if (passedTests === totalTests) {
		log('\n✅ All tests passed! Setup flow logic is correct.', colors.green);
	} else {
		log(`\n❌ ${totalTests - passedTests} test(s) failed. Please review the logic.`, colors.red);
	}

	// Restore backup
	if (existsSync(BACKUP_PATH)) {
		log('\n📦 Restoring original config...', colors.yellow);
		const backup = readFileSync(BACKUP_PATH, 'utf8');
		writeFileSync(CONFIG_PATH, backup);
		unlinkSync(BACKUP_PATH);
	}

	log('\n✨ Test complete!\n', colors.blue);

	process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch(console.error);
