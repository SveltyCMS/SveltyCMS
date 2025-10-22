/**
 * @file tests/bun/content/normalizeId.test.ts
 * @description Unit tests for the normalizeId helper to prevent "[object Object]" persistence bugs.
 */

import { describe, expect, test } from 'bun:test';
import { normalizeId } from '@src/databases/mongodb/methods/normalizeId';

describe('normalizeId', () => {
	test('returns strings unchanged', () => {
		const id = '507f1f77bcf86cd799439011';
		expect(normalizeId(id)).toBe(id);
	});

	test('returns null for nullish values', () => {
		expect(normalizeId(null)).toBeNull();
		expect(normalizeId(undefined)).toBeNull();
	});

	test('extracts identifier from objects with _id', () => {
		const docLike = {
			_id: '68e52fde0c79253729da6fed',
			toString: () => '[object Object]'
		};

		expect(normalizeId(docLike)).toBe('68e52fde0c79253729da6fed');
	});

	test('extracts identifier from objects with id property', () => {
		const docLike = {
			id: 'collection_posts',
			toString: () => '[object Object]'
		};

		expect(normalizeId(docLike)).toBe('collection_posts');
	});

	test('handles ObjectId-like instances', () => {
		const objectIdLike = {
			toHexString: () => '5f8d0d55b54764421b7156c8'
		};

		expect(normalizeId(objectIdLike)).toBe('5f8d0d55b54764421b7156c8');
	});

	test('returns null for plain objects without identifiers', () => {
		expect(normalizeId({ foo: 'bar' })).toBeNull();
	});
});
