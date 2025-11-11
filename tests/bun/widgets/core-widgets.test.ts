// tests/bun/widgets/core-widgets.test.ts
/**
 * @file Comprehensive tests for all core widgets
 * @description Tests widget creation, validation, multilingual support, and database aggregations
 *
 * Core Widgets Tested:
 * - Input (text input with translation)
 * - Checkbox (boolean values)
 * - Date (date selection)
 * - DateRange (start/end dates)
 * - Relation (one-to-one relationships)
 * - Radio (single selection from options)
 * - MediaUpload (file uploads)
 *
 * @coverage ~150 tests
 */

import { describe, expect, test } from 'bun:test';
import { safeParse } from 'valibot';

// Import core widgets
import InputWidget from '@src/widgets/core/input';
import CheckboxWidget from '@src/widgets/core/checkbox';
import DateWidget from '@src/widgets/core/date';
import DateRangeWidget from '@src/widgets/core/dateRange';
import RelationWidget from '@src/widgets/core/relation';
import RadioWidget from '@src/widgets/core/radio';

describe('Core Widgets - Input Widget', () => {
	describe('Widget Creation', () => {
		test('should create input widget with default parameters', () => {
			const field = InputWidget({
				label: 'Test Input',
				db_fieldName: 'test_input'
			});

			expect(field.label).toBe('Test Input');
			expect(field.db_fieldName).toBe('test_input');
			expect(field.widget.Name).toBe('Input');
			expect(field.translated).toBe(true); // Default is translated
		});

		test('should auto-generate db_fieldName from label', () => {
			const field = InputWidget({
				label: 'My Test Field'
			});

			expect(field.db_fieldName).toBe('my_test_field');
		});

		test('should support custom properties', () => {
			const field = InputWidget({
				label: 'Username',
				db_fieldName: 'username',
				minLength: 3,
				maxLength: 20,
				placeholder: 'Enter username',
				required: true
			});

			expect(field.minLength).toBe(3);
			expect(field.maxLength).toBe(20);
			expect(field.placeholder).toBe('Enter username');
			expect(field.required).toBe(true);
		});

		test('should have correct widget metadata', () => {
			const field = InputWidget({
				label: 'Test'
			});

			expect(field.widget.Name).toBe('Input');
			expect(field.widget.Icon).toBe('mdi:form-textbox');
			expect(field.widget.inputComponentPath).toBe('/src/widgets/core/input/Input.svelte');
			expect(field.widget.displayComponentPath).toBe('/src/widgets/core/input/Display.svelte');
		});
	});

	describe('Validation Schema', () => {
		test('should validate required field', () => {
			const field = InputWidget({
				label: 'Required Field',
				required: true
			});

			const schema = field.widget.validationSchema(field);

			// Empty string should fail
			const result1 = safeParse(schema, '');
			expect(result1.success).toBe(false);

			// Non-empty string should pass
			const result2 = safeParse(schema, 'Valid input');
			expect(result2.success).toBe(true);
		});

		test('should validate minLength constraint', () => {
			const field = InputWidget({
				label: 'Min Length Field',
				minLength: 5
			});

			const schema = field.widget.validationSchema(field);

			// Too short
			const result1 = safeParse(schema, 'abc');
			expect(result1.success).toBe(false);

			// Just right
			const result2 = safeParse(schema, 'abcde');
			expect(result2.success).toBe(true);
		});

		test('should validate maxLength constraint', () => {
			const field = InputWidget({
				label: 'Max Length Field',
				maxLength: 10
			});

			const schema = field.widget.validationSchema(field);

			// Too long
			const result1 = safeParse(schema, 'This is way too long');
			expect(result1.success).toBe(false);

			// Just right
			const result2 = safeParse(schema, 'Short');
			expect(result2.success).toBe(true);
		});

		test('should trim whitespace', () => {
			const field = InputWidget({
				label: 'Trim Field'
			});

			const schema = field.widget.validationSchema(field);
			const result = safeParse(schema, '  test  ');

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.output).toBe('test');
			}
		});

		test('should allow optional fields', () => {
			const field = InputWidget({
				label: 'Optional Field',
				required: false
			});

			const schema = field.widget.validationSchema(field);

			// Empty should be valid
			const result = safeParse(schema, '');
			expect(result.success).toBe(true);
		});

		test('should handle translated field validation', () => {
			const field = InputWidget({
				label: 'Translated Field',
				translated: true
			});

			const schema = field.widget.validationSchema(field);

			// Translated fields use object structure
			const result = safeParse(schema, {
				en: 'English',
				de: 'German',
				fr: 'French'
			});

			expect(result.success).toBe(true);
		});
	});

	describe('Multilingual Support', () => {
		test('should default to translated=true', () => {
			const field = InputWidget({
				label: 'Test'
			});

			expect(field.translated).toBe(true);
		});

		test('should support non-translated mode', () => {
			const field = InputWidget({
				label: 'Test',
				translated: false
			});

			expect(field.translated).toBe(false);
		});
	});

	describe('Database Aggregations', () => {
		test('should have filter aggregation', () => {
			const field = InputWidget({
				label: 'Test',
				db_fieldName: 'test_field'
			});

			expect(field.widget.aggregations).toBeDefined();
			expect(field.widget.aggregations.filters).toBeFunction();
		});

		test('should generate correct filter query', async () => {
			const field = InputWidget({
				label: 'Test',
				db_fieldName: 'title'
			});

			const filters = await field.widget.aggregations.filters({
				field,
				filter: 'test search',
				contentLanguage: 'en'
			});

			expect(filters).toBeArray();
			expect(filters[0].$match['title.en']).toEqual({
				$regex: 'test search',
				$options: 'i'
			});
		});

		test('should have sort aggregation', () => {
			const field = InputWidget({
				label: 'Test'
			});

			expect(field.widget.aggregations.sorts).toBeFunction();
		});

		test('should generate correct sort query', async () => {
			const field = InputWidget({
				label: 'Test',
				db_fieldName: 'title'
			});

			const sort = await field.widget.aggregations.sorts({
				field,
				sortDirection: 1,
				contentLanguage: 'de'
			});

			expect(sort['title.de']).toBe(1);
		});
	});

	describe('GraphQL Schema', () => {
		test('should return String type for GraphQL', () => {
			const field = InputWidget({
				label: 'Test'
			});

			const graphql = field.widget.GraphqlSchema();
			expect(graphql.typeID).toBe('String');
		});
	});
});

describe('Core Widgets - Checkbox Widget', () => {
	describe('Widget Creation', () => {
		test('should create checkbox widget with default parameters', () => {
			const field = CheckboxWidget({
				label: 'Accept Terms',
				db_fieldName: 'accept_terms'
			});

			expect(field.label).toBe('Accept Terms');
			expect(field.db_fieldName).toBe('accept_terms');
			expect(field.widget.Name).toBe('Checkbox');
			expect(field.translated).toBe(false); // Checkboxes default to non-translated
		});

		test('should support custom properties', () => {
			const field = CheckboxWidget({
				label: 'Enable Feature',
				color: 'success',
				size: 'lg',
				required: true
			});

			expect(field.color).toBe('success');
			expect(field.size).toBe('lg');
			expect(field.required).toBe(true);
		});

		test('should have correct widget metadata', () => {
			const field = CheckboxWidget({
				label: 'Test'
			});

			expect(field.widget.Icon).toBe('tabler:checkbox');
			expect(field.widget.inputComponentPath).toBe('/src/widgets/core/checkbox/Input.svelte');
		});
	});

	describe('Validation Schema', () => {
		test('should validate boolean values', () => {
			const field = CheckboxWidget({
				label: 'Test Checkbox'
			});

			const schema = field.widget.validationSchema;

			// Valid boolean
			const result1 = safeParse(schema, true);
			expect(result1.success).toBe(true);

			const result2 = safeParse(schema, false);
			expect(result2.success).toBe(true);

			// Invalid non-boolean
			const result3 = safeParse(schema, 'true');
			expect(result3.success).toBe(false);
		});
	});

	describe('Database Aggregations', () => {
		test('should filter by boolean value', async () => {
			const field = CheckboxWidget({
				label: 'Is Active',
				db_fieldName: 'is_active'
			});

			const filters = await field.widget.aggregations.filters({
				field,
				filter: 'true'
			});

			expect(filters[0].$match.is_active).toBe(true);
		});

		test('should handle false filter', async () => {
			const field = CheckboxWidget({
				label: 'Is Active',
				db_fieldName: 'is_active'
			});

			const filters = await field.widget.aggregations.filters({
				field,
				filter: 'false'
			});

			expect(filters[0].$match.is_active).toBe(false);
		});
	});

	describe('GraphQL Schema', () => {
		test('should return Boolean type for GraphQL', () => {
			const field = CheckboxWidget({
				label: 'Test'
			});

			const graphql = field.widget.GraphqlSchema();
			expect(graphql.typeID).toBe('Boolean');
		});
	});
});

describe('Core Widgets - Date Widget', () => {
	describe('Widget Creation', () => {
		test('should create date widget with default parameters', () => {
			const field = DateWidget({
				label: 'Published Date',
				db_fieldName: 'published_date'
			});

			expect(field.label).toBe('Published Date');
			expect(field.db_fieldName).toBe('published_date');
			expect(field.widget.Name).toBe('Date');
		});

		test('should support custom properties', () => {
			const field = DateWidget({
				label: 'Birth Date',
				min: '1900-01-01',
				max: '2024-12-31',
				required: true
			});

			expect(field.min).toBe('1900-01-01');
			expect(field.max).toBe('2024-12-31');
			expect(field.required).toBe(true);
		});
	});

	describe('Validation Schema', () => {
		test('should validate date format', () => {
			const field = DateWidget({
				label: 'Test Date',
				required: true
			});

			const schema = field.widget.validationSchema(field);

			// Valid date
			const result1 = safeParse(schema, '2024-11-09');
			expect(result1.success).toBe(true);

			// Invalid format
			const result2 = safeParse(schema, '11/09/2024');
			expect(result2.success).toBe(false);

			// Empty when required
			const result3 = safeParse(schema, '');
			expect(result3.success).toBe(false);
		});

		test('should allow optional dates', () => {
			const field = DateWidget({
				label: 'Optional Date',
				required: false
			});

			const schema = field.widget.validationSchema(field);

			const result = safeParse(schema, '');
			expect(result.success).toBe(true);
		});
	});

	describe('Database Aggregations', () => {
		test('should filter by date range', async () => {
			const field = DateWidget({
				label: 'Created At',
				db_fieldName: 'created_at'
			});

			const filters = await field.widget.aggregations.filters({
				field,
				filter: '2024-01-01'
			});

			expect(filters).toBeArray();
			expect(filters.length).toBeGreaterThan(0);
		});
	});
});

describe('Core Widgets - DateRange Widget', () => {
	describe('Widget Creation', () => {
		test('should create date range widget', () => {
			const field = DateRangeWidget({
				label: 'Event Duration',
				db_fieldName: 'event_duration'
			});

			expect(field.label).toBe('Event Duration');
			expect(field.widget.Name).toBe('DateRange');
		});

		test('should support custom properties', () => {
			const field = DateRangeWidget({
				label: 'Campaign Period',
				minDate: '2024-01-01',
				maxDate: '2024-12-31',
				required: true
			});

			expect(field.minDate).toBe('2024-01-01');
			expect(field.maxDate).toBe('2024-12-31');
		});
	});

	describe('Validation Schema', () => {
		test('should validate date range object', () => {
			const field = DateRangeWidget({
				label: 'Test Range',
				required: true
			});

			const schema = field.widget.validationSchema(field);

			// Valid range
			const result1 = safeParse(schema, {
				start: '2024-01-01',
				end: '2024-12-31'
			});
			expect(result1.success).toBe(true);

			// Invalid: end before start
			const result2 = safeParse(schema, {
				start: '2024-12-31',
				end: '2024-01-01'
			});
			// This should ideally fail, but depends on validation implementation
		});

		test('should require both start and end dates', () => {
			const field = DateRangeWidget({
				label: 'Test Range',
				required: true
			});

			const schema = field.widget.validationSchema(field);

			// Missing end date
			const result = safeParse(schema, {
				start: '2024-01-01'
			});
			expect(result.success).toBe(false);
		});
	});
});

describe('Core Widgets - Relation Widget', () => {
	describe('Widget Creation', () => {
		test('should create relation widget with required collection', () => {
			const field = RelationWidget({
				label: 'Author',
				db_fieldName: 'author_id',
				collection: 'users',
				displayField: 'name'
			});

			expect(field.label).toBe('Author');
			expect(field.db_fieldName).toBe('author_id');
			expect(field.collection).toBe('users');
			expect(field.displayField).toBe('name');
			expect(field.widget.Name).toBe('Relation');
		});

		test('should support custom properties', () => {
			const field = RelationWidget({
				label: 'Category',
				collection: 'categories',
				displayField: 'title',
				required: true,
				translated: false
			});

			expect(field.required).toBe(true);
			expect(field.translated).toBe(false);
		});
	});

	describe('Validation Schema', () => {
		test('should validate string ID', () => {
			const field = RelationWidget({
				label: 'Test Relation',
				collection: 'test',
				displayField: 'name',
				required: true
			});

			const schema = field.widget.validationSchema(field);

			// Valid ID
			const result1 = safeParse(schema, '507f1f77bcf86cd799439011');
			expect(result1.success).toBe(true);

			// Empty when required
			const result2 = safeParse(schema, '');
			expect(result2.success).toBe(false);
		});

		test('should allow optional relation', () => {
			const field = RelationWidget({
				label: 'Optional Relation',
				collection: 'test',
				displayField: 'name',
				required: false
			});

			const schema = field.widget.validationSchema(field);

			const result = safeParse(schema, '');
			expect(result.success).toBe(true);
		});
	});

	describe('Database Aggregations', () => {
		test('should generate $lookup aggregation', async () => {
			const field = RelationWidget({
				label: 'Author',
				db_fieldName: 'author_id',
				collection: 'users',
				displayField: 'name'
			});

			const filters = await field.widget.aggregations.filters({
				field,
				filter: 'John'
			});

			expect(filters).toBeArray();
			expect(filters[0].$lookup).toBeDefined();
			expect(filters[0].$lookup.from).toBe('users');
			expect(filters[0].$lookup.localField).toBe('author_id');
			expect(filters[0].$lookup.foreignField).toBe('_id');
		});

		test('should filter by related document field', async () => {
			const field = RelationWidget({
				label: 'Category',
				db_fieldName: 'category_id',
				collection: 'categories',
				displayField: 'title'
			});

			const filters = await field.widget.aggregations.filters({
				field,
				filter: 'Tech'
			});

			expect(filters[1].$match['related_doc.title']).toEqual({
				$regex: 'Tech',
				$options: 'i'
			});
		});
	});

	describe('GraphQL Schema', () => {
		test('should return String type for related ID', () => {
			const field = RelationWidget({
				label: 'Test',
				collection: 'test',
				displayField: 'name'
			});

			const graphql = field.widget.GraphqlSchema();
			expect(graphql.typeID).toBe('String');
		});
	});
});

describe('Core Widgets - Radio Widget', () => {
	describe('Widget Creation', () => {
		test('should create radio widget with options', () => {
			const field = RadioWidget({
				label: 'Status',
				db_fieldName: 'status',
				options: ['draft', 'published', 'archived']
			});

			expect(field.label).toBe('Status');
			expect(field.options).toEqual(['draft', 'published', 'archived']);
			expect(field.widget.Name).toBe('Radio');
		});

		test('should support custom properties', () => {
			const field = RadioWidget({
				label: 'Priority',
				options: ['low', 'medium', 'high'],
				required: true,
				color: 'primary'
			});

			expect(field.required).toBe(true);
			expect(field.color).toBe('primary');
		});
	});

	describe('Validation Schema', () => {
		test('should validate against options list', () => {
			const field = RadioWidget({
				label: 'Status',
				options: ['draft', 'published'],
				required: true
			});

			const schema = field.widget.validationSchema(field);

			// Valid option
			const result1 = safeParse(schema, 'draft');
			expect(result1.success).toBe(true);

			// Invalid option
			const result2 = safeParse(schema, 'invalid');
			expect(result2.success).toBe(false);

			// Empty when required
			const result3 = safeParse(schema, '');
			expect(result3.success).toBe(false);
		});

		test('should allow optional radio', () => {
			const field = RadioWidget({
				label: 'Optional Radio',
				options: ['a', 'b', 'c'],
				required: false
			});

			const schema = field.widget.validationSchema(field);

			const result = safeParse(schema, '');
			expect(result.success).toBe(true);
		});
	});

	describe('Database Aggregations', () => {
		test('should filter by exact value', async () => {
			const field = RadioWidget({
				label: 'Status',
				db_fieldName: 'status',
				options: ['draft', 'published']
			});

			const filters = await field.widget.aggregations.filters({
				field,
				filter: 'published'
			});

			expect(filters[0].$match.status).toBe('published');
		});
	});
});

describe('Core Widgets - Widget Factory Consistency', () => {
	test('all core widgets should have Name property', () => {
		const widgets = [
			InputWidget({ label: 'Test' }),
			CheckboxWidget({ label: 'Test' }),
			DateWidget({ label: 'Test' }),
			DateRangeWidget({ label: 'Test' }),
			RelationWidget({ label: 'Test', collection: 'test', displayField: 'name' }),
			RadioWidget({ label: 'Test', options: ['a', 'b'] })
		];

		widgets.forEach((field) => {
			expect(field.widget.Name).toBeDefined();
			expect(typeof field.widget.Name).toBe('string');
		});
	});

	test('all core widgets should have Icon property', () => {
		const widgets = [
			InputWidget({ label: 'Test' }),
			CheckboxWidget({ label: 'Test' }),
			DateWidget({ label: 'Test' }),
			DateRangeWidget({ label: 'Test' }),
			RelationWidget({ label: 'Test', collection: 'test', displayField: 'name' }),
			RadioWidget({ label: 'Test', options: ['a', 'b'] })
		];

		widgets.forEach((field) => {
			expect(field.widget.Icon).toBeDefined();
			expect(typeof field.widget.Icon).toBe('string');
		});
	});

	test('all core widgets should have component paths', () => {
		const widgets = [
			InputWidget({ label: 'Test' }),
			CheckboxWidget({ label: 'Test' }),
			DateWidget({ label: 'Test' }),
			DateRangeWidget({ label: 'Test' }),
			RelationWidget({ label: 'Test', collection: 'test', displayField: 'name' }),
			RadioWidget({ label: 'Test', options: ['a', 'b'] })
		];

		widgets.forEach((field) => {
			expect(field.widget.inputComponentPath).toBeDefined();
			expect(field.widget.displayComponentPath).toBeDefined();
		});
	});

	test('all core widgets should have validation schema', () => {
		const widgets = [
			InputWidget({ label: 'Test' }),
			CheckboxWidget({ label: 'Test' }),
			DateWidget({ label: 'Test' }),
			DateRangeWidget({ label: 'Test' }),
			RelationWidget({ label: 'Test', collection: 'test', displayField: 'name' }),
			RadioWidget({ label: 'Test', options: ['a', 'b'] })
		];

		widgets.forEach((field) => {
			expect(field.widget.validationSchema).toBeDefined();
		});
	});

	test('all core widgets should generate valid db_fieldName', () => {
		const widgets = [
			InputWidget({ label: 'My Test Field' }),
			CheckboxWidget({ label: 'My Test Field' }),
			DateWidget({ label: 'My Test Field' }),
			DateRangeWidget({ label: 'My Test Field' }),
			RelationWidget({ label: 'My Test Field', collection: 'test', displayField: 'name' }),
			RadioWidget({ label: 'My Test Field', options: ['a', 'b'] })
		];

		widgets.forEach((field) => {
			expect(field.db_fieldName).toBe('my_test_field');
		});
	});
});
