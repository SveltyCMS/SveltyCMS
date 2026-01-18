#!/usr/bin/env bun
/**
 * @file scripts/validate-test-setup.ts
 * @description Smart test environment validator
 *
 * This script checks if the required setup is present before running integration/E2E tests.
 * Instead of showing cryptic failures, it provides clear guidance to developers.
 *
 * Checks:
 * - Database configuration (config/private.ts)
 * - Database connectivity
 * - Server availability
 * - Test database isolation
 *
 * Usage:
 *   bun run scripts/validate-test-setup.ts [unit|integration|e2e]
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import picocolors from 'picocolors';

const { green, red, yellow, blue, bold, dim } = picocolors;

interface ValidationResult {
	passed: boolean;
	message: string;
	suggestion?: string;
}

class TestValidator {
	private testType: 'unit' | 'integration' | 'e2e';
	private projectRoot: string;

	constructor(testType: 'unit' | 'integration' | 'e2e' = 'unit') {
		this.testType = testType;
		this.projectRoot = process.cwd();
	}

	/**
	 * Check if config/private.ts exists
	 */
	private checkDatabaseConfig(): ValidationResult {
		const configPath = join(this.projectRoot, 'config', 'private.ts');
		const testConfigPath = join(this.projectRoot, 'config', 'private.test.ts');

		// Unit tests don't need database config
		if (this.testType === 'unit') {
			return {
				passed: true,
				message: 'Database config not required for unit tests'
			};
		}

		// Integration/E2E tests need either real or test config
		const hasConfig = existsSync(configPath);
		const hasTestConfig = existsSync(testConfigPath);

		if (!hasConfig && !hasTestConfig) {
			return {
				passed: false,
				message: 'No database configuration found',
				suggestion: `
${bold('Integration/E2E tests require database configuration.')}

${yellow('Option 1:')} Run the setup wizard first:
  ${dim('$')} bun dev
  ${dim('→')} Complete the setup wizard
  ${dim('→')} This creates config/private.ts

${yellow('Option 2:')} Use the automated integration test script:
  ${dim('$')} bun run test:integration
  ${dim('→')} Automatically creates config/private.test.ts
  ${dim('→')} Uses in-memory MongoDB for testing

${yellow('Option 3:')} Manually create config/private.test.ts:
  ${dim('$')} cp config/private.example.ts config/private.test.ts
  ${dim('→')} Edit with your test database credentials
`
			};
		}

		if (hasTestConfig) {
			return {
				passed: true,
				message: `Using test configuration: ${dim('config/private.test.ts')}`
			};
		}

		// Warn if using production config for tests
		return {
			passed: true,
			message: `${yellow('⚠')} Using production config: ${dim('config/private.ts')}`,
			suggestion: `
${yellow('Warning:')} You're using production database configuration for tests.

${bold('Recommended:')} Create a separate test configuration:
  ${dim('$')} bun run test:integration
  ${dim('→')} Uses isolated test database automatically
`
		};
	}

	/**
	 * Check if server is running (for integration/E2E tests)
	 */
	private async checkServerAvailability(): Promise<ValidationResult> {
		if (this.testType === 'unit') {
			return {
				passed: true,
				message: 'Server not required for unit tests'
			};
		}

		const port = process.env.PORT || '4173';
		const url = `http://localhost:${port}`;

		try {
			await fetch(url, { method: 'HEAD' });
			return {
				passed: true,
				message: `Server is running on ${dim(url)}`
			};
		} catch (error) {
			return {
				passed: false,
				message: `Server not available on ${url}`,
				suggestion: `
${bold('Integration/E2E tests require a running server.')}

${yellow('Option 1:')} Use automated test scripts (recommended):
  ${dim('$')} bun run test:integration  ${dim('# Starts server automatically')}
  ${dim('$')} bun run test:e2e          ${dim('# Starts server automatically')}

${yellow('Option 2:')} Start server manually:
  ${dim('Terminal 1:')} bun run dev
  ${dim('Terminal 2:')} bun test tests/bun/api/
`
			};
		}
	}

	/**
	 * Check if TEST_MODE is set (prevents accidental production data corruption)
	 */
	private checkTestMode(): ValidationResult {
		if (this.testType === 'unit') {
			return {
				passed: true,
				message: 'TEST_MODE not required for unit tests'
			};
		}

		const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';

		if (!isTestMode) {
			return {
				passed: false,
				message: 'TEST_MODE not enabled',
				suggestion: `
${bold('Safety Check Failed:')} TEST_MODE must be enabled for integration/E2E tests.

${yellow('Why?')} This prevents accidental corruption of production data.

${yellow('Solution:')} Set TEST_MODE=true:
  ${dim('$')} TEST_MODE=true bun test tests/bun/api/
  ${dim('or')}
  ${dim('$')} export TEST_MODE=true
  ${dim('$')} bun test tests/bun/api/

${yellow('Better:')} Use automated test scripts:
  ${dim('$')} bun run test:integration  ${dim('# Sets TEST_MODE automatically')}
`
			};
		}

		return {
			passed: true,
			message: `TEST_MODE enabled ${dim('(safe)')}`
		};
	}

	/**
	 * Run all validation checks
	 */
	async validate(): Promise<boolean> {
		console.log(bold(blue(`\n🔍 Validating ${this.testType} test environment...\n`)));

		const checks = [
			{ name: 'Database Configuration', fn: () => this.checkDatabaseConfig() },
			{ name: 'Test Mode Safety', fn: () => this.checkTestMode() },
			{ name: 'Server Availability', fn: () => this.checkServerAvailability() }
		];

		let allPassed = true;

		for (const check of checks) {
			const result = await check.fn();

			if (result.passed) {
				console.log(`${green('✓')} ${check.name}: ${dim(result.message)}`);
				if (result.suggestion) {
					console.log(result.suggestion);
				}
			} else {
				console.log(`${red('✗')} ${check.name}: ${result.message}`);
				if (result.suggestion) {
					console.log(result.suggestion);
				}
				allPassed = false;
			}
		}

		console.log(); // Empty line

		if (allPassed) {
			console.log(green(bold('✅ All checks passed! Ready to run tests.\n')));
		} else {
			console.log(red(bold('❌ Some checks failed. Please fix the issues above.\n')));
		}

		return allPassed;
	}
}

// Main execution
const testType = (process.argv[2] as 'unit' | 'integration' | 'e2e') || 'unit';

if (!['unit', 'integration', 'e2e'].includes(testType)) {
	console.error(red(`Invalid test type: ${testType}`));
	console.log(`Usage: bun run scripts/validate-test-setup.ts [unit|integration|e2e]`);
	process.exit(1);
}

const validator = new TestValidator(testType);
const passed = await validator.validate();

process.exit(passed ? 0 : 1);
