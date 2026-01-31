/**
 * @file tests/bun/utils/schemaComparison.test.ts
 * @description Unit tests for schema comparison utilities
 */

import { describe, expect, test } from 'bun:test';
import { compareSchemaVersions } from '../../../src/lib/utils/schemaComparison';
import type { Schema, FieldInstance } from '../../../src/content/types';

describe('Schema Comparison', () => {
	describe('compareSchemaVersions', () => {
		test('should detect no changes for identical schemas', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.hasChanges).toBe(false);
			expect(result.breakingChanges).toHaveLength(0);
			expect(result.safeChanges).toHaveLength(0);
		});

		test('should detect field removal', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance,
					{
						label: 'Age',
						db_fieldName: 'age',
						widget: { Name: 'number' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.hasChanges).toBe(true);
			expect(result.breakingChanges).toHaveLength(1);
			expect(result.breakingChanges[0].type).toBe('field_removed');
			expect(result.breakingChanges[0].field).toBe('age');
		});

		test('should detect field addition as safe change', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance,
					{
						label: 'Email',
						db_fieldName: 'email',
						widget: { Name: 'email' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.hasChanges).toBe(true);
			expect(result.breakingChanges).toHaveLength(0);
			expect(result.safeChanges).toHaveLength(1);
			expect(result.safeChanges[0].type).toBe('field_added');
			expect(result.safeChanges[0].field).toBe('email');
		});

		test('should detect type changes', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Age',
						db_fieldName: 'age',
						widget: { Name: 'number' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Age',
						db_fieldName: 'age',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.hasChanges).toBe(true);
			expect(result.breakingChanges).toHaveLength(1);
			expect(result.breakingChanges[0].type).toBe('type_changed');
			expect(result.breakingChanges[0].field).toBe('age');
		});

		test('should detect required constraint added', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: true,
						translated: false
					} as FieldInstance
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.hasChanges).toBe(true);
			expect(result.breakingChanges).toHaveLength(1);
			expect(result.breakingChanges[0].type).toBe('required_added');
			expect(result.breakingChanges[0].field).toBe('name');
		});

		test('should detect unique constraint added', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Email',
						db_fieldName: 'email',
						widget: { Name: 'email' },
						required: false,
						unique: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Email',
						db_fieldName: 'email',
						widget: { Name: 'email' },
						required: false,
						unique: true,
						translated: false
					} as FieldInstance
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.hasChanges).toBe(true);
			expect(result.breakingChanges).toHaveLength(1);
			expect(result.breakingChanges[0].type).toBe('unique_added');
			expect(result.breakingChanges[0].field).toBe('email');
		});

		test('should assess migration possibility correctly', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Count',
						db_fieldName: 'count',
						widget: { Name: 'number' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Count',
						db_fieldName: 'count',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.breakingChanges[0].migrationPossible).toBe(true);
			expect(result.breakingChanges[0].transform).toBeDefined();
		});

		test('should count affected documents from sample data', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'OldField',
						db_fieldName: 'oldField',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: []
			};

			const sampleData = [
				{ oldField: 'value1' },
				{ oldField: 'value2' },
				{ otherField: 'value3' }
			];

			const result = compareSchemaVersions(oldSchema, newSchema, sampleData);

			expect(result.breakingChanges[0].affectedCount).toBe(2);
		});

		test('should handle multiple breaking changes', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance,
					{
						label: 'Age',
						db_fieldName: 'age',
						widget: { Name: 'number' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Name',
						db_fieldName: 'name',
						widget: { Name: 'text' },
						required: true, // Changed to required
						translated: false
					} as FieldInstance
					// Age field removed
				]
			};

			const result = compareSchemaVersions(oldSchema, newSchema, []);

			expect(result.hasChanges).toBe(true);
			expect(result.breakingChanges).toHaveLength(2);
			expect(result.breakingChanges.map(c => c.type)).toContain('field_removed');
			expect(result.breakingChanges.map(c => c.type)).toContain('required_added');
		});

		test('should classify severity correctly', () => {
			const oldSchema: Schema = {
				name: 'TestCollection',
				fields: [
					{
						label: 'Data',
						db_fieldName: 'data',
						widget: { Name: 'text' },
						required: false,
						translated: false
					} as FieldInstance
				]
			};

			const newSchema: Schema = {
				name: 'TestCollection',
				fields: []
			};

			const sampleWithData = [{ data: 'value' }];
			const sampleWithoutData = [{ otherField: 'value' }];

			const resultWithData = compareSchemaVersions(oldSchema, newSchema, sampleWithData);
			const resultWithoutData = compareSchemaVersions(oldSchema, newSchema, sampleWithoutData);

			expect(resultWithData.breakingChanges[0].severity).toBe('blocking');
			expect(resultWithoutData.breakingChanges[0].severity).toBe('warning');
		});
	});
});
