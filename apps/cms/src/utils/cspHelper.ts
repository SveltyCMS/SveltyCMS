/**
 * @file src/utils/cspHelper.ts
 * @description Helper utilities for working with CSP nonces in templates
 *
 * ### Usage Examples
 * ```svelte
 * <script>
 *   import { createSecureInlineScript, createSecureInlineStyle } from '@utils/cspHelper';
 *   export let data;
 * </script>
 *
 * <!-- Secure inline script -->
 * {@html createSecureInlineScript(data.cspNonce, 'console.log("Hello CSP!");')}
 *
 * <!-- Secure inline style -->
 * {@html createSecureInlineStyle(data.cspNonce, '.my-class { color: red; }')}
 * ```
 *
 * @security All inline scripts and styles MUST use these helpers for CSP compliance
 */

/**
 * Creates a secure inline script tag with proper CSP nonce.
 * Use this instead of raw <script> tags for CSP compliance.
 *
 * @param nonce - The CSP nonce from page data
 * @param scriptContent - The JavaScript code to execute
 * @param attributes - Additional script attributes (type, async, etc.)
 * @returns HTML string with secure script tag
 *
 * @example
 * ```typescript
 * const script = createSecureInlineScript(
 *   data.cspNonce,
 *   'window.myConfig = { theme: "dark" };'
 * );
 * ```
 */
export function createSecureInlineScript(nonce: string | undefined, scriptContent: string, attributes: Record<string, string> = {}): string {
	if (!nonce) {
		console.warn('CSP nonce is missing. Script may be blocked by Content Security Policy.');
		return `<script ${Object.entries(attributes)
			.map(([k, v]) => `${k}="${v}"`)
			.join(' ')}>${scriptContent}</script>`;
	}

	const attrs = Object.entries(attributes)
		.map(([key, value]) => `${key}="${value}"`)
		.join(' ');

	return `<script nonce="${nonce}" ${attrs}>${scriptContent}</script>`;
}

/**
 * Creates a secure inline style tag with proper CSP nonce.
 * Use this instead of raw <style> tags for CSP compliance.
 *
 * @param nonce - The CSP nonce from page data
 * @param styleContent - The CSS rules to apply
 * @param attributes - Additional style attributes (media, etc.)
 * @returns HTML string with secure style tag
 *
 * @example
 * ```typescript
 * const styles = createSecureInlineStyle(
 *   data.cspNonce,
 *   '.loading { animation: spin 1s linear infinite; }'
 * );
 * ```
 */
export function createSecureInlineStyle(nonce: string | undefined, styleContent: string, attributes: Record<string, string> = {}): string {
	if (!nonce) {
		console.warn('CSP nonce is missing. Styles may be blocked by Content Security Policy.');
		return `<style ${Object.entries(attributes)
			.map(([k, v]) => `${k}="${v}"`)
			.join(' ')}>${styleContent}</style>`;
	}

	const attrs = Object.entries(attributes)
		.map(([key, value]) => `${key}="${value}"`)
		.join(' ');

	return `<style nonce="${nonce}" ${attrs}>${styleContent}</style>`;
}

/**
 * Creates a nonce attribute string for use in Svelte components.
 * Use this when you need to add nonce to existing script/style elements.
 *
 * @param nonce - The CSP nonce from page data
 * @returns Nonce attribute string or empty string if no nonce
 *
 * @example
 * ```svelte
 * <script {getNonceAttribute(data.cspNonce)}>
 *   // Your inline script here
 * </script>
 * ```
 */
export function getNonceAttribute(nonce: string | undefined): string {
	return nonce ? `nonce="${nonce}"` : '';
}

/**
 * Validates that a nonce is properly formatted for CSP.
 * Useful for debugging CSP issues.
 *
 * @param nonce - The nonce to validate
 * @returns True if nonce is valid, false otherwise
 */
export function isValidNonce(nonce: string | undefined): boolean {
	if (!nonce) return false;

	// CSP nonces should be base64 encoded and at least 16 characters
	const base64Regex = /^[A-Za-z0-9+/]+=*$/;
	return nonce.length >= 16 && base64Regex.test(nonce);
}

/**
 * Generates configuration for dynamic script loading with CSP compliance.
 * Use this when you need to load external scripts dynamically.
 *
 * @param nonce - The CSP nonce from page data
 * @param src - The script source URL
 * @param attributes - Additional script attributes
 * @returns Configuration object for script loading
 */
export function createDynamicScriptConfig(
	nonce: string | undefined,
	src: string,
	attributes: Record<string, string> = {}
): {
	src: string;
	nonce?: string;
	attributes: Record<string, string>;
} {
	return {
		src,
		...(nonce && { nonce }),
		attributes
	};
}

/**
 * Helper to check if CSP is enabled for this request.
 * Useful for conditionally applying CSP-compliant code.
 *
 * @param nonce - The CSP nonce from page data
 * @returns True if CSP is enabled (nonce exists), false otherwise
 */
export function isCSPEnabled(nonce: string | undefined): boolean {
	return Boolean(nonce && isValidNonce(nonce));
}
