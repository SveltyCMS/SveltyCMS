/**
 * @file apps/cms/src/stores/widgetStore.svelte.ts
 * @description CMS-level re-export of shared widget store.
 */

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
	widgetFunctions,
	type WidgetStatus,
	type WidgetRegistry
} from '@shared/stores/widgetStore.svelte';
