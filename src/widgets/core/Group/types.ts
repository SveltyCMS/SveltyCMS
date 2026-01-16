/**
 * @file src/widgets/core/Group/types.ts
 * @description Type definitions for the Group widget
 */

// Defines the properties unique to the Group widget
export interface GroupProps {
	// Whether the group is collapsible @default false
	collapsible?: boolean;

	// Whether the group is collapsed by default @default false
	collapsed?: boolean;

	// Group title/label
	groupTitle?: string;

	// Visual style preset @default 'default'
	preset?: 'default' | 'card' | 'bordered';

	// Allow additional widget properties
	[key: string]: unknown;
}
