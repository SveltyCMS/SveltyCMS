/**
 * @file src/components/system/admin-component-registry.ts
 * @description Registry to map string identifiers to Svelte components.
 * This allows widgets to define their UI schema using strings (e.g. { widget: 'Input' })
 * instead of importing components directly, improving tree-shaking and bundle size.
 */

// Complex Components
import IconifyIconsPicker from "@components/iconify-icons-picker.svelte";
import PermissionsSetting from "@components/permissions-setting.svelte";
import JsonSetting from "@components/system/builder/json-setting.svelte";
import SettingGroup from "@components/system/builder/setting-group.svelte";
import CollectionPicker from "@components/system/builder/collection-picker.svelte";
import FieldPicker from "@components/system/builder/field-picker.svelte";
// System Components
import Checkbox from "@components/ui/checkbox.svelte";
import Input from "@components/ui/input.svelte";
import Select from "@components/ui/select.svelte";
import Textarea from "@components/ui/textarea.svelte";
import Toggle from "@components/ui/toggle.svelte";
import type { Component } from "svelte";

// Type for the registry
export type AdminComponentKey = keyof typeof adminComponentRegistry;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const adminComponentRegistry: Record<string, Component<any>> = {
  // Canonical names
  Input,
  Toggle,
  Checkbox,
  Select,
  Textarea,
  Json: JsonSetting,
  group: SettingGroup,
  IconifyIconsPicker,
  PermissionsSetting,
  CollectionPicker,
  FieldPicker,
  // Aliases used by existing GuiSchemas (legacy/plural/lowercase spellings)
  input: Input,
  Toggles: Toggle,
  select: Select,
  textarea: Textarea,
  Slug: Input,
};

/**
 * Resolves a component from a string key or returns the component itself if passed directly.
 * Unknown widget identifiers return null so callers can skip them instead of rendering nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveAdminComponent(widget: unknown): Component<any> | null {
  if (typeof widget === "string") {
    return adminComponentRegistry[widget as AdminComponentKey] ?? null;
  }
  if (typeof widget === "function") {
    return widget as Component<any>;
  }
  return null;
}
