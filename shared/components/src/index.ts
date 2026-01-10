/**
 * @fileoverview Shared UI components for SveltyCMS
 * 
 * Provides reusable components for consistency across applications.
 * All components are accessible and follow WCAG 2.1 AA standards.
 * 
 * @module @shared/components
 */

// System components
export { default as Button } from './system/Button.svelte';
export { default as Card } from './system/Card.svelte';
export { default as Modal } from './system/Modal.svelte';
export { default as Alert } from './system/Alert.svelte';

// Form components
export { default as Input } from './forms/Input.svelte';
export { default as Select } from './forms/Select.svelte';
export { default as Checkbox } from './forms/Checkbox.svelte';
export { default as Radio } from './forms/Radio.svelte';

// Layout components
export { default as Container } from './layout/Container.svelte';
export { default as Grid } from './layout/Grid.svelte';
export { default as Stack } from './layout/Stack.svelte';

// Navigation components
export { default as Nav } from './navigation/Nav.svelte';
export { default as Breadcrumb } from './navigation/Breadcrumb.svelte';
export { default as Tabs } from './navigation/Tabs.svelte';

// Types
export type { ButtonVariant, ButtonSize } from './system/Button.svelte';
export type { CardPadding } from './system/Card.svelte';
export type { AlertType } from './system/Alert.svelte';
