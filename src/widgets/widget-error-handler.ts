/**
 * @file src/widgets/utils/widgetErrorHandler.ts
 * @description Widget-specific error handling utilities that integrate with the unified error system
 *
 * This utility provides a consistent way for widgets to:
 * - Handle Valibot validation errors
 * - Format error messages for display
 * - Integrate with the validationStore
 * - Use standardized error codes
 */

import { validationStore } from '@src/stores/store.svelte';
import { getErrorMessage } from '@utils/error-handling';
import type { BaseIssue } from 'valibot';

// ============================================================================
// Error Codes
// ============================================================================

// Standard error codes for widget validation
export const WidgetErrorCode = {
	REQUIRED: 'REQUIRED',
	MIN_LENGTH: 'MIN_LENGTH',
	MAX_LENGTH: 'MAX_LENGTH',
	MIN_VALUE: 'MIN_VALUE',
	MAX_VALUE: 'MAX_VALUE',
	INVALID_FORMAT: 'INVALID_FORMAT',
	INVALID_EMAIL: 'INVALID_EMAIL',
	INVALID_PHONE: 'INVALID_PHONE',
	INVALID_URL: 'INVALID_URL',
	INVALID_DATE: 'INVALID_DATE',
	INVALID_NUMBER: 'INVALID_NUMBER',
	CUSTOM: 'CUSTOM'
} as const;

export type WidgetErrorCode = (typeof WidgetErrorCode)[keyof typeof WidgetErrorCode];

// ============================================================================
// Types
// ============================================================================

export interface WidgetValidationResult {
	code?: WidgetErrorCode;
	issues?: string[];
	message?: string;
	valid: boolean;
}

export interface WidgetValidationOptions {
	/** Field name for validationStore */
	fieldName: string;
	/** Current touch state */
	isTouched?: boolean;
	/** Whether to show errors only after touch */
	requireTouch?: boolean;
	/** Whether to update validationStore automatically */
	updateStore?: boolean;
}

// ============================================================================
// Valibot Error Extraction
// ============================================================================

// Extract a user-friendly error message from a Valibot validation error
export function extractValibotError(error: ValibotError): string {
	if (!error.issues || error.issues.length === 0) {
		return 'Validation failed';
	}

	// Return the first issue's message
	const firstIssue = error.issues[0] as BaseIssue<unknown> | undefined;
	return firstIssue?.message || 'Validation failed';
}

// Extract all error messages from a Valibot validation error
export function extractAllValibotErrors(error: ValibotError): string[] {
	if (!error.issues || error.issues.length === 0) {
		return ['Validation failed'];
	}

	return error.issues.map((issue) => (issue as BaseIssue<unknown>).message || 'Validation failed');
}

// Custom type for Valibot errors to avoid complex generic issues
interface ValibotError {
	issues?: unknown[];
}

// Type guard to check if an error is a Valibot ValiError
export function isValibotError(error: unknown): error is ValibotError {
	return error !== null && typeof error === 'object' && 'issues' in error && Array.isArray((error as ValibotError).issues);
}

// ============================================================================
// Error Code Mapping
// ============================================================================

// Map Valibot issue type to widget error code
export function mapValibotIssueToCode(issue: BaseIssue<unknown>): WidgetErrorCode {
	const type = issue.type?.toLowerCase() || '';
	const message = issue.message?.toLowerCase() || '';

	// Check by validation type
	if (type.includes('min_length') || message.includes('at least')) {
		return WidgetErrorCode.MIN_LENGTH;
	}
	if (type.includes('max_length') || message.includes('no more than')) {
		return WidgetErrorCode.MAX_LENGTH;
	}
	if (type.includes('min_value') || message.includes('must be at least')) {
		return WidgetErrorCode.MIN_VALUE;
	}
	if (type.includes('max_value') || message.includes('must not exceed')) {
		return WidgetErrorCode.MAX_VALUE;
	}
	if (type.includes('email') || message.includes('email')) {
		return WidgetErrorCode.INVALID_EMAIL;
	}
	if (message.includes('phone')) {
		return WidgetErrorCode.INVALID_PHONE;
	}
	if (type.includes('url') || message.includes('url')) {
		return WidgetErrorCode.INVALID_URL;
	}
	if (type.includes('date') || message.includes('date')) {
		return WidgetErrorCode.INVALID_DATE;
	}
	if (type.includes('number') || message.includes('number')) {
		return WidgetErrorCode.INVALID_NUMBER;
	}
	if (message.includes('required') || type.includes('non_empty')) {
		return WidgetErrorCode.REQUIRED;
	}

	return WidgetErrorCode.INVALID_FORMAT;
}

// ============================================================================
// Main Validation Handler
// ============================================================================

/**
 * Handle widget validation with unified error handling
 *
 * @example
 * ```typescript
 * function validateInput() {
 *   const result = handleWidgetValidation(
 *     () => parse(schema, value),
 *     { fieldName: 'email', updateStore: true }
 *   );
 *   if (!result.valid) {
 *     console.error('Validation failed:', result.message);
 *   }
 * }
 * ```
 */
export function handleWidgetValidation(validateFn: () => void, options: WidgetValidationOptions): WidgetValidationResult {
	const { fieldName, updateStore = true, requireTouch = false, isTouched = true } = options;

	// Skip validation if touch is required but field hasn't been touched
	if (requireTouch && !isTouched) {
		if (updateStore) {
			validationStore.clearError(fieldName);
		}
		return { valid: true };
	}

	try {
		validateFn();

		// Clear any existing error
		if (updateStore) {
			validationStore.clearError(fieldName);
		}

		return { valid: true };
	} catch (error) {
		let message: string;
		let code: WidgetErrorCode = WidgetErrorCode.CUSTOM;
		let issues: string[] = [];

		if (isValibotError(error)) {
			message = extractValibotError(error);
			issues = extractAllValibotErrors(error);
			if (error.issues?.[0]) {
				code = mapValibotIssueToCode(error.issues[0] as BaseIssue<unknown>);
			}
		} else {
			// Use unified error handler for other error types
			message = getErrorMessage(error);
		}

		// Update validation store
		if (updateStore) {
			validationStore.setError(fieldName, message);
		}

		return {
			valid: false,
			message,
			code,
			issues
		};
	}
}

// ============================================================================
// Convenience Functions
// ============================================================================

// Clear validation error for a field
export function clearWidgetError(fieldName: string): void {
	validationStore.clearError(fieldName);
}

// Set a validation error for a field
export function setWidgetError(fieldName: string, message: string): void {
	validationStore.setError(fieldName, message);
}

// Check if a field has a validation error
export function hasWidgetError(fieldName: string): boolean {
	return validationStore.hasError(fieldName);
}

// Get the current validation error for a field
export function getWidgetError(fieldName: string): string | undefined {
	return validationStore.getError(fieldName) ?? undefined;
}

// ============================================================================
// Async Validation Support
// ============================================================================

/**
 * Handle async widget validation (e.g., server-side checks)
 *
 * @example
 * ```typescript
 * async function checkEmailUnique() {
 *   const result = await handleAsyncWidgetValidation(
 *     async () => {
 *       const response = await fetchApi('/api/check-email', { email });
 *       if (!response.success) throw new Error(response.message);
 *     },
 *     { fieldName: 'email' }
 *   );
 * }
 * ```
 */
export async function handleAsyncWidgetValidation(
	validateFn: () => Promise<void>,
	options: WidgetValidationOptions
): Promise<WidgetValidationResult> {
	const { fieldName, updateStore = true, requireTouch = false, isTouched = true } = options;

	if (requireTouch && !isTouched) {
		if (updateStore) {
			validationStore.clearError(fieldName);
		}
		return { valid: true };
	}

	try {
		await validateFn();

		if (updateStore) {
			validationStore.clearError(fieldName);
		}

		return { valid: true };
	} catch (error) {
		const message = getErrorMessage(error);

		if (updateStore) {
			validationStore.setError(fieldName, message);
		}

		return {
			valid: false,
			message,
			code: WidgetErrorCode.CUSTOM
		};
	}
}
