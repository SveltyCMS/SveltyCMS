import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { telemetryService } from '../../../src/services/TelemetryService';

describe('TelemetryService Environment Checks', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('should return test_mode status when TEST_MODE is true', async () => {
		process.env.TEST_MODE = 'true';
		const result = await telemetryService.checkUpdateStatus();
		expect(result.status).toBe('test_mode');
	});

	it('should return test_mode status when CI is true', async () => {
		process.env.CI = 'true';
		const result = await telemetryService.checkUpdateStatus();
		expect(result.status).toBe('test_mode');
	});

	it('should return test_mode status when VITEST is true', async () => {
		process.env.VITEST = 'true';
		const result = await telemetryService.checkUpdateStatus();
		expect(result.status).toBe('test_mode');
	});

	it('should return test_mode status when NODE_ENV is test', async () => {
		process.env.NODE_ENV = 'test';
		const result = await telemetryService.checkUpdateStatus();
		expect(result.status).toBe('test_mode');
	});
});
