// tests/bun/widgets/modern-widget-architecture.test.ts
// @ts-expect-error - Bun types are not available in TypeScript
import type { FieldConfig, WidgetConfig } from '@src/widgets/factory';
import { createDefaultDisplay, createWidget, ensureModernField, isModernField } from '@src/widgets/factory';
import { describe, expect, test } from 'bun:test';

describe('Modern Widget Architecture', () => {
	describe('Widget Factory', () => {
		test('should create a widget definition with createWidget', () => {
			const config: WidgetConfig = {
				Name: 'TestWidget',
				Icon: 'test-icon',
				Description: 'Test widget description',
				componentPath: '/test/widget.svelte',
				GuiSchema: {
					properties: {
						label: { type: 'string' },
						required: { type: 'boolean' }
					}
				}
			};

			const widgetFactory = createWidget(config);

			// Test factory function properties
			expect(widgetFactory.Name).toBe('TestWidget');
			expect(widgetFactory.Icon).toBe('test-icon');
			expect(widgetFactory.Description).toBe('Test widget description');
			expect(widgetFactory.componentPath).toBe('/test/widget.svelte');
		});

		test('should create field instances with widget factory', () => {
			const config: WidgetConfig = {
				Name: 'TestWidget',
				Icon: 'test-icon',
				Description: 'Test widget'
			};

			const widgetFactory = createWidget(config);

			const fieldConfig: FieldConfig = {
				label: 'Test Field',
				db_fieldName: 'test_field',
				required: true,
				translated: false
			};

			const fieldInstance = widgetFactory(fieldConfig);

			// Test field instance structure
			expect(fieldInstance.label).toBe('Test Field');
			expect(fieldInstance.db_fieldName).toBe('test_field');
			expect(fieldInstance.required).toBe(true);
			expect(fieldInstance.translated).toBe(false);
			expect(fieldInstance.widget).toBeDefined();
			expect(fieldInstance.widget.Name).toBe('TestWidget');
		});

		test('should handle widget-specific properties', () => {
			const config: WidgetConfig = {
				Name: 'NumberWidget',
				Icon: 'number-icon',
				Description: 'Number widget'
			};

			const widgetFactory = createWidget(config);

			const fieldInstance = widgetFactory({
				label: 'Age',
				db_fieldName: 'age',
				minValue: 0,
				maxValue: 120,
				step: 1
			});

			// Test widget-specific properties are preserved
			expect(fieldInstance.minValue).toBe(0);
			expect(fieldInstance.maxValue).toBe(120);
			expect(fieldInstance.step).toBe(1);
		});
	});

	describe('Language Support', () => {
		test('should create default display function for translated widgets', async () => {
			const display = createDefaultDisplay(true);

			const data = {
				en: 'English text',
				de: 'German text',
				fr: 'French text'
			};

			const result = await display({ data, contentLanguage: 'de' });
			expect(result).toBe('German text');
		});

		test('should fallback to default language for translated widgets', async () => {
			const display = createDefaultDisplay(true);

			const data = {
				en: 'English text',
				de: 'German text'
			};

			const result = await display({ data, contentLanguage: 'es' }); // Spanish not available
			expect(result).toBe('English text'); // Should fallback to English
		});

		test('should use default language for non-translated widgets', async () => {
			const display = createDefaultDisplay(false);

			const data = {
				en: 'English text',
				de: 'German text'
			};

			const result = await display({ data, contentLanguage: 'de' });
			expect(result).toBe('English text'); // Should always use default language
		});
	});

	describe('Modern Field Detection', () => {
		test('should detect modern field instances', () => {
			const config: WidgetConfig = {
				Name: 'TestWidget',
				Description: 'Test widget'
			};

			const widgetFactory = createWidget(config);
			const fieldInstance = widgetFactory({
				label: 'Test Field',
				db_fieldName: 'test_field'
			});

			expect(isModernField(fieldInstance)).toBe(true);
		});

		test('should reject legacy field format', () => {
			const legacyField = {
				widget: 'text', // String instead of object
				label: 'Legacy Field'
			};

			expect(isModernField(legacyField)).toBe(false);
		});

		test('should ensure modern field format', () => {
			const config: WidgetConfig = {
				Name: 'TestWidget',
				Description: 'Test widget'
			};

			const widgetFactory = createWidget(config);
			const _fieldInstance = widgetFactory({
				label: 'Test Field',
				db_fieldName: 'test_field'
			});

			expect(() => ensureModernField(_fieldInstance)).not.toThrow();
		});

		test('should throw error for non-modern field', () => {
			const legacyField = {
				widget: 'text',
				label: 'Legacy Field'
			};

			expect(() => ensureModernField(legacyField)).toThrow('Field is not in modern format');
		});
	});

	describe('Widget Aggregations', () => {
		test('should support database aggregations', () => {
			const config: WidgetConfig = {
				Name: 'SearchableWidget',
				Description: 'Widget with search capabilities',
				aggregations: {
					filters: async (info) => {
						return [
							{
								$match: {
									[`${info.field.db_fieldName}.${info.contentLanguage}`]: {
										$regex: info.filter,
										$options: 'i'
									}
								}
							}
						];
					},
					sorts: async (info) => {
						return {
							[`${info.field.db_fieldName}.${info.contentLanguage}`]: info.sortDirection
						};
					}
				}
			};

			const widgetFactory = createWidget(config);

			expect(widgetFactory.aggregations).toBeDefined();
			expect(widgetFactory.aggregations.filters).toBeFunction();
			expect(widgetFactory.aggregations.sorts).toBeFunction();
		});
	});
});
