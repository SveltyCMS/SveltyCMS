/**
 * @file src/widgets/core/Group/index.ts
 * @description Group Widget Definition.
 *
 * Implements a Group widget using the Three Pillars Architecture.
 * Groups multiple fields together for better organization and user experience.
 *
 * @features
 * - **Field Organization**: Groups related fields together visually
 * - **Collapsible Sections**: Optional collapsible functionality for better UX
 * - **Visual Variants**: Different styling options (default, card, bordered)
 * - **Accessibility**: Proper ARIA attributes and keyboard navigation
 * - **Responsive Design**: Adapts to different screen sizes
 * - **Nested Structure**: Can contain other widgets within the group
 */

// Components needed for the GuiSchema
// import IconifyIconsPicker from '@components/iconify-icons-picker.svelte';
// import PermissionsSetting from '@components/permissions-setting.svelte';
// import Input from '@components/system/inputs/input.svelte';
// import Toggles from '@components/system/inputs/toggles.svelte';

import { createWidget } from '@src/widgets/widget-factory';
import { object, type InferInput as ValibotInput } from 'valibot';

import type { GroupProps } from './types';

// Define the validation schema for the group data.
// Groups can contain any data structure, so we use a flexible object schema.
const GROUP_VALIDATION_SCHEMA = object({});

// Create the widget definition using the factory.
const GroupWidget = createWidget<GroupProps>({
	Name: 'Group',
	Icon: 'mdi:folder-outline',
	Description: 'Group related fields together',

	// Define paths to the dedicated Svelte components.
	inputComponentPath: ' $args[0].Value.ToLower() ',
	displayComponentPath: ' $args[0].Value.ToLower() ',

	// Assign the validation schema.
	validationSchema: GROUP_VALIDATION_SCHEMA,

	// Set widget-specific defaults.
	defaults: {
		collapsible: false,
		collapsed: false,
		variant: 'default'
	},

	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: 'Input', required: true },
		groupTitle: { widget: 'Input', required: false },
		collapsible: { widget: 'Toggles', required: false },
		collapsed: { widget: 'Toggles', required: false },
		variant: { widget: 'Input', required: false },
		db_fieldName: { widget: 'Input', required: false },
		icon: { widget: 'IconifyIconsPicker', required: false },
		helper: { widget: 'Input', required: false },
		width: { widget: 'Input', required: false },
		permissions: { widget: 'PermissionsSetting', required: false }
	},

	// Groups don't typically need database aggregations as they contain other widgets
	aggregations: {}
});

export default GroupWidget;

// Export helper types for use in Svelte components.
export type FieldType = ReturnType<typeof GroupWidget>;
export type GroupWidgetData = ValibotInput<typeof GROUP_VALIDATION_SCHEMA>;
