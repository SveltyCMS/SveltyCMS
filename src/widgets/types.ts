/**
 * @file src/widgets/types.ts
 * @description Widget types for the widget system
 */

import type { SvelteComponent } from 'svelte';
import type { FieldInstance, Schema } from '../content/types';
import type { User } from '@src/databases/auth/types';
import type { GuiFieldConfig } from '@utils/utils';
import type { WidgetPlaceholder } from './placeholder';

export type WidgetType = 'core' | 'custom';

export interface Widget<T = any> {
	(field: FieldInstance<T>): FieldInstance<T>;
	// Static properties
	Name: string;
	Icon?: string;
	Description?: string;
	GuiSchema?: SvelteComponent;
	GraphqlSchema?: any;
	aggregations?: any;
	__widgetType?: WidgetType;
	__dependencies?: string[];
	__inputComponentPath?: string;
	__displayComponentPath?: string;
	componentPath?: string;
}

export interface WidgetFunction {
	(config: Record<string, unknown>): Widget;
	__widgetId?: string;
	Name: string;
	GuiSchema?: unknown;
	GraphqlSchema?: unknown;
	Icon?: string;
	Description?: string;
	aggregations?: unknown;
	__widgetType?: WidgetType; // Track if core or custom
	__dependencies?: string[]; // Track widget dependencies
	__inputComponentPath?: string; // Path to Input component (3-pillar architecture)
	__displayComponentPath?: string; // Path to Display component (3-pillar architecture)
	componentPath?: string; // Path to the widget's Input component (for Fields.svelte compatibility)
}

export type WidgetModule = {
	default: WidgetFunction;
};

export type WidgetParam = {
	field: FieldInstance;
	schema: Schema;
	user: User;
	value: any;
	values: any;
	onValueChange: (value: any) => void;
	config: GuiFieldConfig;
	placeholder: WidgetPlaceholder;
};
