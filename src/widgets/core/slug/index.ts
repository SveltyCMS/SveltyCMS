/**
 * @file src/widgets/core/slug/index.ts
 * @description Slug Widget Definition
 *
 * A specialized widget for generating URL-friendly slugs from token patterns.
 * Automatically updates when source fields change.
 *
 * @features
 * - **Token Pattern Support**: Uses token system to generate slugs from other fields
 * - **Auto-update**: Reactively updates when source fields change
 * - **Slug Generation**: Automatically converts to URL-friendly format
 * - **Configurable Pattern**: Define custom slug patterns using tokens
 */

import IconifyPicker from '@components/IconifyPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';

import {
	any,
	maxLength,
	minLength,
	object,
	optional,
	pipe,
	string,
	transform,
	type BaseIssue,
	type BaseSchema
} from 'valibot';

export interface SlugProps {
	/** Token pattern for generating the slug (e.g., "{{entry.title | slugify}}") */
	pattern?: string;
	/** Minimum length */
	minLength?: number;
	/** Maximum length */
	maxLength?: number;
	/** Whether to auto-update when source fields change */
	autoUpdate?: boolean;
}

// Create validation schema
const createValidationSchema = (
	field: ReturnType<typeof SlugWidget>
): BaseSchema<unknown, unknown, BaseIssue<unknown>> => {
	const stringRules: Array<unknown> = [transform((s: string) => (typeof s === 'string' ? s.trim() : s))];

	if (field.required) stringRules.push(minLength(1, 'This field is required.'));
	if ((field as SlugProps).minLength)
		stringRules.push(
			minLength((field as SlugProps).minLength as number, `Must be at least ${(field as SlugProps).minLength} characters.`)
		);
	if ((field as SlugProps).maxLength)
		stringRules.push(
			maxLength((field as SlugProps).maxLength as number, `Must be no more than ${(field as SlugProps).maxLength} characters.`)
		);

	const schema: BaseSchema<unknown, unknown, BaseIssue<unknown>> = pipe(string(), ...(stringRules as unknown as []));

	if (field.translated) {
		return object({ _any: any() });
	}

	return field.required ? schema : optional(schema, '');
};

// Create the widget definition
const SlugWidget = createWidget<SlugProps>({
	Name: 'Slug',
	Icon: 'mdi:link-variant',
	Description: 'URL-friendly slug field with token pattern support',
	inputComponentPath: '/src/widgets/core/slug/Input.svelte',
	displayComponentPath: '/src/widgets/core/slug/Display.svelte',

	validationSchema: createValidationSchema,

	defaults: {
		translated: false, // Slugs are typically not translated
		autoUpdate: true,
		pattern: '{{entry.title | slugify}}'
	},

	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		translated: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false },
		placeholder: { widget: Input, required: false },
		minLength: { widget: Input, required: false },
		maxLength: { widget: Input, required: false },
		pattern: { widget: Input, required: false },
		autoUpdate: { widget: Toggles, required: false }
	},

	// GraphQL schema
	GraphqlSchema: () => ({
		typeID: 'String',
		graphql: ''
	})
});

export default SlugWidget;

// Export helper types
export type FieldType = ReturnType<typeof SlugWidget>;

