/**
 * @file src/components/system/adminComponentRegistry.ts
 * @description Registry to map string identifiers to Svelte components.
 * This allows widgets to define their UI schema using strings (e.g. { widget: 'Input' })
 * instead of importing components directly, improving tree-shaking and bundle size.
 */

import type { Component } from 'svelte';

// System Components
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

// Complex Components
import IconifyIconsPicker from '@components/IconifyIconsPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import CollectionPicker from '@components/system/builder/CollectionPicker.svelte';
import FieldPicker from '@components/system/builder/FieldPicker.svelte';

// Type for the registry
export type AdminComponentKey = keyof typeof adminComponentRegistry;

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
export function resolveAdminComponent(widget: string | Component<any>): Component<any> | null {
	if (typeof widget === 'string') {
		return adminComponentRegistry[widget] || null;
	}
	return widget;
}
