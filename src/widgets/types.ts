/**
 * @file src/widgets/types.ts
 * @description Widget types for the widget system
 */

import type { User } from '@root/src/auth';
import type { WidgetId } from '@root/src/auth/types';
import type { GuiFieldConfig } from '@utils/utils';
import type { SvelteComponent } from 'svelte';
import type { Field, Schema } from '../content/types';

export type WidgetStatus = 'active' | 'inactive';

export type ModifyRequestParams = {
	collection: Schema;
	id?: WidgetId;
	field: Field;
	data: { get: () => unknown; update: (newData: unknown) => void };
	user: User;
	type: 'GET' | 'POST' | 'DELETE' | 'PATCH';
	meta_data?: Record<string, unknown>;
};

export interface Widget {
	__widgetId: string;
	Name: string;
	dependencies?: string[];
	component?: typeof SvelteComponent;
	config?: Record<string, unknown>;
	validateWidget: () => Promise<string | null>; // Required validation method
	updateTranslationStatus: (value: unknown, field: Field, language: string) => void; // Required translation status
	modifyRequest?: (args: ModifyRequestParams) => Promise<Record<string, unknown>>;
	GuiFields?: unknown;
	Icon?: string;
	Description?: string;
	aggregations?: unknown;
}

export interface WidgetFunction {
	(config: Record<string, unknown>): Field;
	componentPath: string;
	Name?: string;
	GuiSchema?: Record<string, GuiFieldConfig>;
	GraphqlSchema?: GraphqlSchema; // Consider defining a proper type for this
	Icon?: string;
	Description?: string;
	aggregations?: unknown;
	modifyRequest?: (args: ModifyRequestParams) => Promise<Record<string, unknown>>;
	dependencies?: string[];
	toString?: () => string;
	__widgetId?: string; // For unique widget identification
	__isCore?: boolean; // To track if widget is core or custom
}

export interface WidgetModule {
	default: WidgetFunction; // Default export of a widget module
}

export interface WidgetPermissions {
	permissions: Record<string, Record<string, boolean>>;
	[key: string]: Record<string, Record<string, boolean>> | unknown;
}

export interface WidgetPlaceholder {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}
