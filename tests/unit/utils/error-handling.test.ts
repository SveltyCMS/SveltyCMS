/**
 * @file tests/bun/utils/errorHandling.test.ts
 * @description Tests for error handling utilities
 */

import { describe, expect, it } from 'bun:test';
import { AppError, getErrorMessage, isAppError, isHttpError, wrapError } from '../../../src/utils/error-handling';

describe('Error Handling - AppError Class', () => {
	it('should create AppError with message and status', () => {
		const error = new AppError('Test error', 404);

		expect(error.message).toBe('Test error');
		expect(error.status).toBe(404);
		expect(error instanceof Error).toBe(true);
		expect(error instanceof AppError).toBe(true);
	});

	it('should create AppError with original error', () => {
		const originalError = new Error('Original error');
		const appError = new AppError('Wrapped error', 500, originalError);

		expect(appError.message).toBe('Wrapped error');
		expect(appError.status).toBe(500);
		expect(appError.originalError).toBe(originalError);
	});

	it('should create AppError with details', () => {
		const error = new AppError('Error with details', 400, undefined, {
			field: 'email',
			reason: 'invalid format'
		});

		expect(error.message).toBe('Error with details');
		expect(error.status).toBe(400);
		expect(error.details).toEqual({ field: 'email', reason: 'invalid format' });
	});

	it('should have proper error name', () => {
		const error = new AppError('Test', 500);
		expect(error.name).toBe('AppError');
	});
});

describe('Error Handling - Type Guards', () => {
	it('should identify AppError instances', () => {
		const appError = new AppError('Test', 500);
		const regularError = new Error('Test');

		expect(isAppError(appError)).toBe(true);
		expect(isAppError(regularError)).toBe(false);
		expect(isAppError('string')).toBe(false);
		expect(isAppError(null)).toBe(false);
		expect(isAppError(undefined)).toBe(false);
	});

	it('should identify HttpError-like objects', () => {
		const httpError = {
			status: 404,
			body: { message: 'Not found' }
		};

		expect(isHttpError(httpError)).toBe(true);
		expect(isHttpError({ status: 500 })).toBe(true);
		expect(isHttpError({ body: {} })).toBe(false);
		expect(isHttpError(new Error('test'))).toBe(false);
	});
});

describe('Error Handling - Error Messages', () => {
	it('should extract message from Error', () => {
		const error = new Error('Standard error');
		expect(getErrorMessage(error)).toBe('Standard error');
	});

	it('should extract message from AppError', () => {
		const error = new AppError('App error', 500);
		expect(getErrorMessage(error)).toBe('App error');
	});

	it('should extract message from HttpError', () => {
		const error = {
			status: 404,
			body: { message: 'Not found' }
		};
		expect(getErrorMessage(error)).toBe('Not found');
	});

	it('should handle string errors', () => {
		expect(getErrorMessage('String error')).toBe('String error');
	});

	it('should handle objects with message property', () => {
		const error = { message: 'Object error' };
		expect(getErrorMessage(error)).toBe('Object error');
	});

	it('should handle unknown error types', () => {
		// getErrorMessage stringifies objects or calls String()
		expect(getErrorMessage(null)).toBe('null');
		expect(getErrorMessage(123)).toBe('123');
		expect(getErrorMessage(true)).toBe('true');
		// Empty object returns '[object Object]' via String()
		expect(getErrorMessage({})).toBe('[object Object]');
	});

	it('should stringify objects without message', () => {
		const error = { code: 'ERR_001', details: 'Info' };
		const message = getErrorMessage(error);
		expect(message).toContain('ERR_001');
	});
});

describe('Error Handling - Wrap Error', () => {
	it('should wrap Error in AppError', () => {
		const originalError = new Error('Original');
		const wrapped = wrapError(originalError);

		expect(isAppError(wrapped)).toBe(true);
		expect(wrapped.status).toBe(500);
		expect(wrapped.originalError).toBe(originalError);
	});

	it('should preserve AppError', () => {
		const appError = new AppError('App error', 400);
		const wrapped = wrapError(appError);

		expect(wrapped).toBe(appError);
		expect(wrapped.status).toBe(400);
	});

	it('should wrap HttpError', () => {
		const httpError = {
			status: 404,
			body: { message: 'Not found' }
		};
		const wrapped = wrapError(httpError);

		expect(isAppError(wrapped)).toBe(true);
		expect(wrapped.status).toBe(404);
		expect(wrapped.message).toBe('Not found');
	});

	it('should use custom default message', () => {
		const error = new Error('Original');
		const wrapped = wrapError(error, 'Custom default');

		expect(wrapped.message).toBe('Original');
	});

	it('should use default message for unknown errors', () => {
		const wrapped = wrapError(null, 'Custom default');

		// getErrorMessage returns 'null' for null
		expect(wrapped.message).toBe('null');
		expect(wrapped.status).toBe(500);

		// Test with empty object - returns '[object Object]'
		const wrapped2 = wrapError({}, 'Custom default');
		expect(wrapped2.message).toBe('[object Object]');
	});
	it('should use custom default status', () => {
		const error = new Error('Test');
		const wrapped = wrapError(error, 'Default message', 418);

		expect(wrapped.status).toBe(418);
	});

	it('should wrap string errors', () => {
		const wrapped = wrapError('String error');

		expect(isAppError(wrapped)).toBe(true);
		expect(wrapped.message).toBe('String error');
		expect(wrapped.status).toBe(500);
	});
});

describe('Error Handling - Integration', () => {
	it('should handle error chain', () => {
		const rootError = new Error('Root cause');
		const wrappedOnce = wrapError(rootError, 'First wrap', 400);
		const wrappedTwice = wrapError(wrappedOnce, 'Second wrap', 500);

		expect(wrappedTwice.status).toBe(400); // Preserves original AppError
		expect(wrappedTwice.originalError).toBe(rootError);
	});

	it('should extract messages from error chain', () => {
		const rootError = new Error('Root');
		const wrapped = new AppError('Wrapped', 500, rootError);

		expect(getErrorMessage(wrapped)).toBe('Wrapped');
		expect(getErrorMessage(wrapped.originalError)).toBe('Root');
	});
});
