import PriceWidget from '@src/widgets/custom/price/index';
import { parse } from 'valibot';
import { describe, expect, it, mock } from 'bun:test';

// Mock dependencies
mock.module('@src/paraglide/messages', () => ({}));
mock.module('@stores/widgetStore.svelte', () => ({ widgets: {} }));

describe('Price Widget', () => {
	it('should have correct default configuration', () => {
		const widget = PriceWidget({ label: 'Test Price' });

		expect(widget.widget.Name).toBe('Price');
		expect(widget.widget.defaults?.defaultCurrency).toBe('EUR');
	});

	describe('Validation Schema', () => {
		const instance = PriceWidget({ label: 'Test' });
		const getSchema = instance.widget.validationSchema as (field: any) => any;

		it('should validate valid price', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				db_fieldName: 'test'
			});

			const input = { amount: 10.5, currency: 'USD' };
			expect(() => parse(schema, input)).not.toThrow();
		});

		it('should allow null amount if not required', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				db_fieldName: 'test',
				required: false
			});

			const input = { amount: null, currency: 'EUR' };
			expect(() => parse(schema, input)).not.toThrow();
		});

		it('should fail if amount missing and required', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				db_fieldName: 'test',
				required: true
			});

			const input = { amount: null, currency: 'EUR' };
			expect(() => parse(schema, input)).toThrow();
		});

		it('should enforce min value', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				db_fieldName: 'test',
				min: 10
			});

			expect(() => parse(schema, { amount: 5, currency: 'EUR' })).toThrow();
			expect(() => parse(schema, { amount: 10, currency: 'EUR' })).not.toThrow();
		});
	});
});
