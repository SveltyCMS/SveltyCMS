/**
 * @file src/utils/errorHandling.ts
 * @description Robust error handling utilities for Svelte 5 applications.
 */

/**
 * A custom error class for application-specific errors.
 * It includes an HTTP status code, optional original error, and additional details.
 */
export class AppError extends Error {
	public readonly status: number;
	public readonly originalError?: unknown;
	public readonly details?: Record<string, unknown>;

	constructor(message: string, status = 500, originalError?: unknown, details?: Record<string, unknown>) {
		super(message);
		this.name = 'AppError';
		this.status = status;
		this.originalError = originalError;
		this.details = details;

		// Preserve the stack trace of the original error if available
		if (originalError instanceof Error) {
			this.stack = originalError.stack;
		}
	}
}

/**
 * Type guard to check if an error is an instance of AppError.
 */
export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}

/**
 * Type guard for SvelteKit's HttpError.
 */
export interface HttpError {
	status: number;
	body?: { message?: string };
}

export function isHttpError(error: unknown): error is HttpError {
	return typeof error === 'object' && error !== null && 'status' in error && typeof (error as any).status === 'number';
}

/**
 * Safely extracts an error message from an unknown error type.
 * @param error The error to process.
 * @returns A string representing the error message.
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	if (isHttpError(error) && error.body?.message) {
		return error.body.message;
	}
	if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
		return (error as any).message;
	}
	try {
		const stringified = JSON.stringify(error);
		if (stringified !== '{}') {
			return stringified;
		}
	} catch {
		// Fallback if stringify fails (e.g., circular references)
	}
	return String(error);
}

/**
 * Wraps an unknown error in an AppError, normalizing it for consistent handling.
 * This is especially useful in `catch` blocks.
 *
 * @param error The error to wrap.
 * @param defaultMessage A default message if the error has no discernible message.
 * @param defaultStatus The HTTP status code to use if the error doesn't have one.
 * @returns An instance of AppError.
 */
export function wrapError(error: unknown, defaultMessage = 'An unexpected error occurred.', defaultStatus = 500): AppError {
	if (error instanceof AppError) {
		return error;
	}

	const message = getErrorMessage(error) || defaultMessage;
	const status = isHttpError(error) ? error.status : defaultStatus;

	return new AppError(message, status, error);
}
