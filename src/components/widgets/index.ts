/**
 * @file src/components/widgets/index.ts
 * @description Widget Index - Main entry point for widget system
 */

import { initializeWidgets, widgets } from './widgetManager.svelte';

// Initialize widgets immediately
await initializeWidgets();

// Export widgets object as default for backward compatibility
export default widgets;

// Re-export everything from widgetManager for direct access
export * from './widgetManager.svelte';
