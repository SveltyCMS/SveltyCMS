/**
 * @file tests/unit/widgets/price.test.ts
 * @description Unit tests for the Price widget
 */

import { describe, expect, it, mock } from 'bun:test';
import PriceWidget from '../../../src/widgets/custom/price';
import { parse } from 'valibot';

// Mock dependencies
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
				// biome-ignore lint/style/useNamingConvention: system standard
				db_fieldName: 'test'
			});

			const input = { amount: 10.5, currency: 'USD' };
			expect(() => parse(schema, input)).not.toThrow();
		});

		it('should allow null amount if not required', () => {
			const schema = getSchema({
				label: 'Test',
				widget: instance.widget,
				// biome-ignore lint/style/useNamingConvention: system standard
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
				// biome-ignore lint/style/useNamingConvention: system standard
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
				// biome-ignore lint/style/useNamingConvention: system standard
				db_fieldName: 'test',
				min: 10
			});

			expect(() => parse(schema, { amount: 5, currency: 'EUR' })).toThrow();
			expect(() => parse(schema, { amount: 10, currency: 'EUR' })).not.toThrow();
		});
	});
});
