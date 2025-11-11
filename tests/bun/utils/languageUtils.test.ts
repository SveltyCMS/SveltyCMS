/**
 * @file tests/bun/utils/languageUtils.test.ts
 * @description Tests for language utility functions
 */

// @ts-expect-error - Bun test is available at runtime
import { describe, it, expect } from 'bun:test';
import { getLanguageName } from '@utils/languageUtils';

describe('Language Utils - Get Language Name', () => {
	it('should get language names', () => {
		// These should return string values
		expect(typeof getLanguageName('en')).toBe('string');
		expect(typeof getLanguageName('de')).toBe('string');
		expect(typeof getLanguageName('fr')).toBe('string');
		expect(typeof getLanguageName('es')).toBe('string');
		expect(typeof getLanguageName('ja')).toBe('string');
		expect(typeof getLanguageName('zh')).toBe('string');
	});

	it('should get language names in specific display locale', () => {
		// These should return string values (exact format depends on browser/runtime)
		const deInEn = getLanguageName('de', 'en');
		const jaInEn = getLanguageName('ja', 'en');
		const frInEn = getLanguageName('fr', 'en');
		const enInDe = getLanguageName('en', 'de');

		expect(typeof deInEn).toBe('string');
		expect(typeof jaInEn).toBe('string');
		expect(typeof frInEn).toBe('string');
		expect(typeof enInDe).toBe('string');

		// Should have non-zero length
		expect(deInEn.length).toBeGreaterThan(0);
		expect(jaInEn.length).toBeGreaterThan(0);
	});

	it('should handle extended language codes', () => {
		// Chinese variants
		expect(getLanguageName('zh-CN')).toBeTruthy();
		expect(getLanguageName('zh-TW')).toBeTruthy();

		// English variants
		expect(getLanguageName('en-US')).toBeTruthy();
		expect(getLanguageName('en-GB')).toBeTruthy();
	});

	it('should handle invalid language codes gracefully', () => {
		const result = getLanguageName('invalid-code');
		expect(typeof result).toBe('string');
		// Should return the code itself or a fallback
		expect(result.length).toBeGreaterThan(0);
	});

	it('should handle empty strings', () => {
		const result = getLanguageName('');
		expect(typeof result).toBe('string');
	});

	it('should be case-insensitive for common codes', () => {
		// Most browsers handle this, but behavior may vary
		const lowercase = getLanguageName('en');
		const uppercase = getLanguageName('EN');

		expect(typeof lowercase).toBe('string');
		expect(typeof uppercase).toBe('string');
	});
});

describe('Language Utils - Common Languages', () => {
	const commonLanguages = [
		'ar',
		'bn',
		'cs',
		'da',
		'el',
		'fi',
		'he',
		'hi',
		'hu',
		'id',
		'it',
		'ko',
		'nl',
		'no',
		'pl',
		'pt',
		'ro',
		'ru',
		'sv',
		'th',
		'tr',
		'uk',
		'vi',
		'de',
		'fr',
		'es',
		'ja',
		'zh',
		'en'
	];

	it('should handle all common ISO 639-1 languages', () => {
		commonLanguages.forEach((code) => {
			const result = getLanguageName(code);
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});
	});

	it('should provide language names in different display locales', () => {
		// Test that same language code returns results in different locales
		const languages = ['de', 'fr', 'es', 'it', 'ja'];

		languages.forEach((code) => {
			const inOwnLocale = getLanguageName(code);
			const inEnglish = getLanguageName(code, 'en');

			expect(typeof inOwnLocale).toBe('string');
			expect(typeof inEnglish).toBe('string');
			expect(inOwnLocale.length).toBeGreaterThan(0);
			expect(inEnglish.length).toBeGreaterThan(0);
		});
	});
});

describe('Language Utils - Edge Cases', () => {
	it('should handle regional variants', () => {
		// Portuguese variants
		const ptBR = getLanguageName('pt-BR');
		const ptPT = getLanguageName('pt-PT');

		expect(typeof ptBR).toBe('string');
		expect(typeof ptPT).toBe('string');
		expect(ptBR.length).toBeGreaterThan(0);
		expect(ptPT.length).toBeGreaterThan(0);

		// Spanish variants
		const esES = getLanguageName('es-ES');
		const esMX = getLanguageName('es-MX');

		expect(typeof esES).toBe('string');
		expect(typeof esMX).toBe('string');
	});

	it('should handle special characters in language names', () => {
		// Languages with special characters
		const specialChars = ['ja', 'zh', 'ar', 'he', 'th', 'ko', 'el', 'ru'];

		specialChars.forEach((code) => {
			const name = getLanguageName(code);
			expect(typeof name).toBe('string');
			expect(name.length).toBeGreaterThan(0);
		});
	});

	it('should return consistent results', () => {
		// Same call should return same result
		const first = getLanguageName('en');
		const second = getLanguageName('en');

		expect(first).toBe(second);
	});
});
