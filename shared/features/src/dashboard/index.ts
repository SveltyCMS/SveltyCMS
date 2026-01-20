/**
 * @file shared/features/src/dashboard/index.ts
 * @description - Dashboard Feature Library
 *
 * Dashboard with monitoring widgets.
 * Routes: libs/dashboard/src/routes/
 * Widgets: libs/dashboard/src/widgets/
 */

// Base component
export { default as BaseWidget } from './BaseWidget.svelte';

// Widget exports
export { type WidgetCategory, type WidgetDefaults, WIDGET_DEFAULTS, getWidgetDefaults } from './widgets/widgetDefaults';
