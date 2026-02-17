/**
 * @file src/widgets/custom/Price/index.ts
 * @description Price Widget Definition.
 *
 * Handles monetary values with currency support.
 */

import type { FieldInstance } from '@src/content/types';
import { createWidget } from '@src/widgets/widgetFactory';
import { maxValue, minValue, nullable, number, object, optional, pipe, string } from 'valibot';
import type { PriceProps } from './types';

const validationSchema = (field: FieldInstance) => {
	let amountSchema: any = number('Amount must be a number.');

	if (field.min !== undefined) {
		amountSchema = pipe(amountSchema, minValue(field.min as number, `Minimum amount is ${field.min}.`));
	}
	if (field.max !== undefined) {
		amountSchema = pipe(amountSchema, maxValue(field.max as number, `Maximum amount is ${field.max}.`));
	}

	const schema = object({
		amount: field.required ? amountSchema : nullable(amountSchema),
		currency: string('Currency is required.')
	});

	return field.required ? schema : optional(schema);
};

const PriceWidget = createWidget<PriceProps>({
	Name: 'Price',
	Icon: 'mdi:currency-usd',
	Description: 'Price with currency support',
	inputComponentPath: '/src/widgets/custom/Price/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Price/Display.svelte',
	validationSchema,

	defaults: {
		defaultCurrency: 'EUR',
		allowedCurrencies: ['EUR', 'USD', 'GBP'],
		min: 0,
		step: 0.01
	},

	GuiSchema: {
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		defaultCurrency: { widget: 'Input', label: 'Default Currency (ISO)' },
		min: { widget: 'Input', type: 'number', label: 'Min Amount' },
		max: { widget: 'Input', type: 'number', label: 'Max Amount' },
		// We could add a 'multiselect' for allowedCurrencies ideally, reusing simple input for now or array string
		step: { widget: 'Input', type: 'number', label: 'Step' }
	},

	GraphqlSchema: () => {
		return {
			typeID: 'Price',
			graphql: `
				type Price {
					amount: Float
					currency: String
				}
			`
		};
	}
});

export default PriceWidget;
export type FieldType = ReturnType<typeof PriceWidget>;
