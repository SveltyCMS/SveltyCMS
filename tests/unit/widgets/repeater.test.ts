import RepeaterWidget from '@src/widgets/core/repeater/index';
import { parse } from 'valibot';
import { describe, expect, it, mock } from 'bun:test';

// Mock dependencies
mock.module('@src/paraglide/messages', () => ({
	widget_relation_description: () => 'Relation Description'
}));

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
				db_fieldName: 'test'
			});

			const input = [{}, {}];
			expect(() => parse(schema, input)).not.toThrow();
		});

		it('should fail minLength validation', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
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
				db_fieldName: 'test',
				required: true
			});

			expect(() => parse(schema, [])).toThrow();
		});
	});
});
