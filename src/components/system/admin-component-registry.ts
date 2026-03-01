/**
 * @file src/components/system/admin-component-registry.ts
 * @description Registry to map string identifiers to Svelte components.
 * This allows widgets to define their UI schema using strings (e.g. { widget: 'Input' })
 * instead of importing components directly, improving tree-shaking and bundle size.
 */

// Complex Components
import IconifyIconsPicker from '@components/iconify-icons-picker.svelte';
import PermissionsSetting from '@components/permissions-setting.svelte';
import CollectionPicker from '@components/system/builder/collection-picker.svelte';
import FieldPicker from '@components/system/builder/field-picker.svelte';
// System Components
import Input from '@components/system/inputs/input.svelte';
import Toggles from '@components/system/inputs/toggles.svelte';
import type { Component } from 'svelte';

// Type for the registry
export type AdminComponentKey = keyof typeof adminComponentRegistry;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const adminComponentRegistry: Record<string, Component<any>> = {
	Input,
	Toggles,
	IconifyIconsPicker,
	PermissionsSetting,
	CollectionPicker,
	FieldPicker
};

/**
 * Resolves a component from a string key or returns the component itself if passed directly
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveAdminComponent(widget: string | Component<any>): Component<any> | null {
	if (typeof widget === 'string') {
		return adminComponentRegistry[widget as AdminComponentKey] || null;
	}
	return widget;
}
