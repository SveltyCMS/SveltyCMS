/**
 * @files shared/stores/src/index.ts
 * @description - Shared State Management
 *
 * Svelte stores used across workspaces.
 */

export { app } from './store.svelte';
export { groupsNeedingConfig } from './configStore.svelte';
export {
	themeStore,
	initializeDarkMode,
	setThemePreference,
	toggleDarkMode,
	useSystemPreference,
	initializeThemeStore,
	updateTheme,
	clearError,
	startAutoRefresh,
	stopAutoRefresh
} from './themeStore.svelte';
export type { ThemePreference } from './themeStore.svelte';

export {
	widgets,
	getWidget,
	getWidgetFunction,
	isWidgetActive,
	isWidgetCore,
	isWidgetCustom,
	isWidgetMarketplace,
	getWidgetDependencies,
	canDisableWidget,
	isWidgetAvailable,
	widgetStoreActions,
	widgetFunctions
} from './widgetStore.svelte';
export type { WidgetStatus, WidgetRegistry } from './widgetStore.svelte';

export * from './system';
