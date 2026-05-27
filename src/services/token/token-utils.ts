/**
 * @file src/services/token/tokenUtils.ts
 * @description Pure utility functions for token processing that are safe for client-side use.
 */

// Validates token syntax in a string
export function validateTokenSyntax(text: string): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Check for empty tokens {{}}
	if (/\{\{\s*\}\}/.test(text)) {
		errors.push('Empty token detected');
	}

	// Check for nested tokens {{ {{ }} }}
	if (/\{\{[^{}]*\{\{[^{}]*\}\}[^{}]*\}\}/.test(text)) {
		errors.push('Nested tokens are not supported');
	}

	// Check for unmatched braces (basic check)
	const openCount = (text.match(/\{\{/g) || []).length;
	const closeCount = (text.match(/\}\}/g) || []).length;

	if (openCount !== closeCount) {
		errors.push(`Unmatched braces: ${openCount} opening vs ${closeCount} closing`);
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

// Extracts all token paths from a string
export function extractTokenPaths(text: string): string[] {
	const regex = /(?<!\\)\{\{\s*([^}|]+)(?:\|[^}]+)?\s*\}\}/g;
	const paths: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		paths.push(match[1].trim());
	}

	return paths;
}

// Checks if a string contains any tokens
export function containsTokens(text: string): boolean {
	return typeof text === 'string' && text.includes('{{') && text.includes('}}');
}
