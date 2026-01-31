/**
 * @file tests/bun/utils/serialization.test.ts
 * @description Unit tests for serialization utilities
 */

import { describe, expect, test } from 'bun:test';
import {
	serializeNode,
	toDatabaseId,
	generateStableId,
	isValidDatabaseId
} from '../../../src/lib/utils/serialization';
import type { ContentNode, DatabaseId, ISODateString } from '../../../src/content/types';

describe('Serialization Utilities', () => {
	describe('serializeNode', () => {
		test('should serialize a minimal ContentNode', () => {
			const node: ContentNode = {
				_id: '123' as DatabaseId,
				name: 'Test Node',
				path: '/test',
				nodeType: 'category',
				order: 0,
				translations: [],
				updatedAt: '2024-01-01T00:00:00Z' as ISODateString,
				createdAt: '2024-01-01T00:00:00Z' as ISODateString
			};

			const serialized = serializeNode(node);

			expect(serialized._id).toBe('123');
			expect(serialized.name).toBe('Test Node');
			expect(serialized.path).toBe('/test');
			expect(serialized.nodeType).toBe('category');
			expect(serialized.order).toBe(0);
			expect(serialized.updatedAt).toBe('2024-01-01T00:00:00Z');
			expect(serialized.createdAt).toBe('2024-01-01T00:00:00Z');
		});

		test('should handle parentId', () => {
			const node: ContentNode = {
				_id: '123' as DatabaseId,
				parentId: '456' as DatabaseId,
				name: 'Child Node',
				path: '/parent/child',
				nodeType: 'collection',
				order: 0,
				translations: [],
				updatedAt: '2024-01-01T00:00:00Z' as ISODateString,
				createdAt: '2024-01-01T00:00:00Z' as ISODateString
			};

			const serialized = serializeNode(node);

			expect(serialized.parentId).toBe('456');
		});

		test('should include optional fields', () => {
			const node: ContentNode = {
				_id: '123' as DatabaseId,
				name: 'Test Node',
				path: '/test',
				nodeType: 'category',
				order: 0,
				icon: 'mdi:folder',
				slug: 'test-node',
				description: 'A test node',
				tenantId: 'tenant-1',
				translations: [{ languageTag: 'en', translationName: 'Test Node' }],
				updatedAt: '2024-01-01T00:00:00Z' as ISODateString,
				createdAt: '2024-01-01T00:00:00Z' as ISODateString
			};

			const serialized = serializeNode(node);

			expect(serialized.icon).toBe('mdi:folder');
			expect(serialized.slug).toBe('test-node');
			expect(serialized.description).toBe('A test node');
			expect(serialized.tenantId).toBe('tenant-1');
			expect(serialized.translations).toHaveLength(1);
		});

		test('should not include collectionDef', () => {
			const node: ContentNode = {
				_id: '123' as DatabaseId,
				name: 'Collection Node',
				path: '/collection',
				nodeType: 'collection',
				order: 0,
				translations: [],
				updatedAt: '2024-01-01T00:00:00Z' as ISODateString,
				createdAt: '2024-01-01T00:00:00Z' as ISODateString,
				collectionDef: {
					name: 'Collection',
					fields: []
				}
			};

			const serialized = serializeNode(node);

			// @ts-expect-error - checking that collectionDef is not in serialized object
			expect(serialized.collectionDef).toBeUndefined();
		});
	});

	describe('toDatabaseId', () => {
		test('should convert valid string to DatabaseId', () => {
			const id = toDatabaseId('abc123');
			expect(id).toBe('abc123');
		});

		test('should throw error for empty string', () => {
			expect(() => toDatabaseId('')).toThrow('Invalid DatabaseId');
		});

		test('should throw error for non-string input', () => {
			// @ts-expect-error - testing invalid input
			expect(() => toDatabaseId(null)).toThrow('Invalid DatabaseId');
			// @ts-expect-error - testing invalid input
			expect(() => toDatabaseId(undefined)).toThrow('Invalid DatabaseId');
			// @ts-expect-error - testing invalid input
			expect(() => toDatabaseId(123)).toThrow('Invalid DatabaseId');
		});
	});

	describe('generateStableId', () => {
		test('should generate a valid string ID', () => {
			const id = generateStableId();
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);
		});

		test('should generate unique IDs', () => {
			const id1 = generateStableId();
			const id2 = generateStableId();
			expect(id1).not.toBe(id2);
		});

		test('should generate UUIDs if crypto.randomUUID is available', () => {
			const id = generateStableId();
			// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
			const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
			
			// Check if it's a UUID or fallback format
			const isUUID = uuidRegex.test(id);
			const isFallback = /^\d+-[a-z0-9]+$/.test(id);
			
			expect(isUUID || isFallback).toBe(true);
		});

		test('should generate multiple unique IDs', () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(generateStableId());
			}
			expect(ids.size).toBe(100);
		});
	});

	describe('isValidDatabaseId', () => {
		test('should return true for valid ID', () => {
			expect(isValidDatabaseId('abc123')).toBe(true);
			expect(isValidDatabaseId('uuid-v4-format')).toBe(true);
		});

		test('should return false for empty string', () => {
			expect(isValidDatabaseId('')).toBe(false);
		});

		test('should return false for non-string values', () => {
			expect(isValidDatabaseId(null)).toBe(false);
			expect(isValidDatabaseId(undefined)).toBe(false);
			expect(isValidDatabaseId(123)).toBe(false);
			expect(isValidDatabaseId({})).toBe(false);
			expect(isValidDatabaseId([])).toBe(false);
		});
	});
});
