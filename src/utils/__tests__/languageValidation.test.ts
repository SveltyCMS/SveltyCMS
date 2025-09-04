/**
 * @file src/utils/__tests__/languageValidation.test.ts
 * @description Tests for language validation utilities
 */

import { describe, it, expect } from 'bun:test';
import { isValidLanguageCode, getValidLanguageCodes, getLanguageInfo, getAllLanguages, searchLanguages } from '../languageValidation';

describe('Language Validation', () => {
	it('should validate correct language codes', () => {
		expect(isValidLanguageCode('en')).toBe(true);
		expect(isValidLanguageCode('de')).toBe(true);
		expect(isValidLanguageCode('fr')).toBe(true);
		expect(isValidLanguageCode('es')).toBe(true);
	});

	it('should reject invalid language codes', () => {
		expect(isValidLanguageCode('invalid')).toBe(false);
		expect(isValidLanguageCode('en-US')).toBe(false); // Should be 2 chars only
		expect(isValidLanguageCode('123')).toBe(false);
		expect(isValidLanguageCode('')).toBe(false);
		expect(isValidLanguageCode('a')).toBe(false); // Too short
	});

	it('should be case insensitive', () => {
		expect(isValidLanguageCode('EN')).toBe(true);
		expect(isValidLanguageCode('De')).toBe(true);
		expect(isValidLanguageCode('FR')).toBe(true);
	});

	it('should return all valid language codes', () => {
		const codes = getValidLanguageCodes();
		expect(codes).toBeInstanceOf(Array);
		expect(codes.length).toBeGreaterThan(100); // ISO 639-1 has many languages
		expect(codes).toContain('en');
		expect(codes).toContain('de');
		expect(codes).toContain('fr');
	});

	it('should get language information', () => {
		const english = getLanguageInfo('en');
		expect(english).toBeTruthy();
		expect(english?.code).toBe('en');
		expect(english?.name).toBe('English');
		expect(english?.native).toBe('English');

		const invalid = getLanguageInfo('invalid');
		expect(invalid).toBeNull();
	});

	it('should return all languages', () => {
		const languages = getAllLanguages();
		expect(languages).toBeInstanceOf(Array);
		expect(languages.length).toBeGreaterThan(100);
		expect(languages[0]).toHaveProperty('code');
		expect(languages[0]).toHaveProperty('name');
		expect(languages[0]).toHaveProperty('native');
	});

	it('should search languages by query', () => {
		const englishSearch = searchLanguages('english');
		expect(englishSearch).toBeInstanceOf(Array);
		expect(englishSearch.some((lang) => lang.code === 'en')).toBe(true);

		const germanSearch = searchLanguages('deutsch');
		expect(germanSearch.some((lang) => lang.code === 'de')).toBe(true);

		const codeSearch = searchLanguages('fr');
		expect(codeSearch.some((lang) => lang.code === 'fr')).toBe(true);
	});
});
