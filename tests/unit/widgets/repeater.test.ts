/**
 * @file tests/unit/widgets/repeater.test.ts
 * @description Unit tests for the Repeater widget
 */

import { describe, expect, it, mock } from 'bun:test';
import RepeaterWidget from '@widgets/core/repeater';
import { parse } from 'valibot';

// Mock dependencies
// Mock Svelte store
mock.module('@stores/widgetStore.svelte', () => ({
	widgets: {
		widgetFunctions: {},
		widgets: {}
	}
}));

describe('Repeater Widget', () => {
	it('should have correct default configuration', () => {
		const widget = RepeaterWidget({ label: 'Test Repeater' });

		expect(widget.widget.Name).toBe('Repeater');
		expect(widget.widget.defaults?.min).toBe(0);
		expect(widget.widget.defaults?.addLabel).toBe('Add Item');
	});

	describe('Validation Schema', () => {
		const instance = RepeaterWidget({ label: 'Test' });
		// validationSchema can be a function or object. In Repeater it is a function.
		const getSchema = instance.widget.validationSchema as (field: any) => any;

		it('should validate valid array', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				// biome-ignore lint/style/useNamingConvention: system standard
				db_fieldName: 'test'
			});

			const input = [{}, {}];
			expect(() => parse(schema, input)).not.toThrow();
		});

		it('should fail minLength validation', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				// biome-ignore lint/style/useNamingConvention: system standard
				db_fieldName: 'test',
				min: 3
			});

			const input = [{}, {}];
			expect(() => parse(schema, input)).toThrow();
		});

		it('should fail maxLength validation', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				// biome-ignore lint/style/useNamingConvention: system standard
				db_fieldName: 'test',
				max: 1
			});

			const input = [{}, {}];
			expect(() => parse(schema, input)).toThrow();
		});

		it('should enforce required if set', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				// biome-ignore lint/style/useNamingConvention: system standard
				db_fieldName: 'test',
				required: true
			});

			expect(() => parse(schema, [])).toThrow();
		});
	});
});
