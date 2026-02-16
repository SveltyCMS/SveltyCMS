/**
 * @file tests/unit/stores/setupStore.test.ts
 * @description Tests for setup wizard store
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { setupStore } from '@src/stores/setupStore.svelte';

// Mock dependencies
mock.module('@utils/logger', () => ({
	logger: {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {}
	}
}));

describe('Setup Store', () => {
	// Reset store before each test
	beforeEach(() => {
		setupStore.clear();
	});

	it('should initialize with default values', () => {
		const { wizard } = setupStore;
		expect(wizard.currentStep).toBe(0);
		expect(wizard.dbConfig.type).toBe('mongodb');
		expect(wizard.adminUser.username).toBe('');
	});

	it('should validate step 0 (Database) correctly', () => {
		const { wizard } = setupStore;

		// Initial state should PASS validation because defaults are valid (localhost, etc causes valid schema)
		expect(setupStore.validateStep(0, false)).toBe(true);

		// Test invalid state
		wizard.dbConfig.host = '';
		expect(setupStore.validateStep(0, false)).toBe(false);

		// Restore valid data
		wizard.dbConfig.host = 'localhost';
		wizard.dbConfig.port = '27017';
		wizard.dbConfig.name = 'testdb';
		// User/pass are optional for some DBs but let's assume valid

		// Actually the schema might require them or not, checking defaults
		// Schema usually requires non-empty strings if not optional

		// Let's set everything to be safe
		wizard.dbConfig.user = 'root';
		wizard.dbConfig.password = 'pass';

		expect(setupStore.validateStep(0, false)).toBe(true);
	});

	it('should update step index', () => {
		const { wizard } = setupStore;
		wizard.currentStep = 1;
		expect(wizard.currentStep).toBe(1);
	});

	it('should handle admin user validation', () => {
		const { wizard } = setupStore;

		wizard.adminUser.username = 'admin';
		wizard.adminUser.email = 'invalid-email';
		wizard.adminUser.password = '123';
		wizard.adminUser.confirmPassword = '123';

		// Should fail email validation
		expect(setupStore.validateStep(1, false)).toBe(false);

		wizard.adminUser.email = 'admin@example.com';
		// Password too short (usually 8 chars)
		expect(setupStore.validateStep(1, false)).toBe(false);

		wizard.adminUser.password = 'Password123!';
		wizard.adminUser.confirmPassword = 'Password123!';

		expect(setupStore.validateStep(1, false)).toBe(true);
	});

	it('should check password matching', () => {
		const { wizard } = setupStore;
		wizard.adminUser.password = 'Password123!';
		wizard.adminUser.confirmPassword = 'Mismatch123!';

		// Using the derived state
		expect(setupStore.passwordRequirements.match).toBe(false);

		wizard.adminUser.confirmPassword = 'Password123!';
		// This should now be true thanks to $derived.by
		expect(setupStore.passwordRequirements.match).toBe(true);
	});
});
