/**
 * @file src/utils/uuid.ts
 * @description Browser-compatible UUID generator
 * Provides UUID generation without Node.js crypto dependency for client-side code
 */

/**
 * Generate a UUID v4 string that works in both browser and Node.js environments
 * Uses crypto.getRandomValues() in browsers and falls back to Math.random() when needed
 * @returns UUID v4 string
 */
export function generateUUID(): string {
	// Browser environment - use crypto.getRandomValues()
	if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
		const buffer = new Uint8Array(16);
		globalThis.crypto.getRandomValues(buffer);

		// Set version (4) and variant bits
		buffer[6] = (buffer[6] & 0x0f) | 0x40; // Version 4
		buffer[8] = (buffer[8] & 0x3f) | 0x80; // Variant 10

		// Convert to hex string with dashes
		const hex = Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
		return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
	}

	// Node.js environment - try to use crypto module
	if (typeof process !== 'undefined' && process.versions?.node) {
		try {
			// Dynamic import to avoid bundling crypto in client code
			const crypto = eval('require')('crypto');
			const buffer = crypto.randomBytes(16);

			// Set version (4) and variant bits
			buffer[6] = (buffer[6] & 0x0f) | 0x40; // Version 4
			buffer[8] = (buffer[8] & 0x3f) | 0x80; // Variant 10

			// Convert to hex string with dashes
			const hex = buffer.toString('hex');
			return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
		} catch {
			// Fall through to Math.random() fallback
		}
	}

	// Fallback for environments without crypto support
	// This is less secure but works everywhere
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Alias for generateUUID for compatibility
 */
export const uuidv4 = generateUUID;

/**
 * Validate UUID format
 * @param uuid UUID string to validate
 * @returns true if valid UUID format
 */
export function isValidUUID(uuid: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}
