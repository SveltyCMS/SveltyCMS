/**
 * @file apps/cms/src/stores/index.ts
 * @description Centralized store access for the CMS application.
 * Explicitly exports to improve tree-shaking and build performance.
 */

export { widgets, widgetStoreActions } from './widgetStore.svelte';
export { preferences, systemPreferences } from './systemPreferences.svelte';
export { statusStore } from './statusStore.svelte';
export { loadingOperations, type LoadingOperation, LoadingStore, globalLoadingStore } from './loadingStore.svelte';
export { modeStateMachine } from './modeStateMachine.svelte';
export { type EditAction, type ToolbarControls, type ImageEditorTool, type ImageEditorState, imageEditorStore } from './imageEditorStore.svelte';
export {
	type CollectionWidgetDependency,
	analyzeCollectionWidgets,
	analyzeMultipleCollections,
	getAllRequiredWidgets,
	canSafelyDisableWidget,
	getWidgetActivationRecommendations,
	validateCollections,
	logCollectionAnalysis
} from './collectionWidgetAnalyzer.svelte';
export {
	type ModeType,
	type Widget,
	statusMap,
	collections,
	collection,
	collectionValue,
	mode,
	contentStructure,
	modifyEntry,
	targetWidget,
	setCollection,
	setMode,
	setCollectionValue,
	setModifyEntry,
	setContentStructure,
	setTargetWidget,
	getTotalCollections,
	getHasSelectedEntries,
	getCurrentCollectionName,
	entryActions,
	currentCollectionId,
	collectionsLoading,
	collectionsError,
	unAssigned,
	selectedEntries
} from './collectionStore.svelte';
export { type ActiveTokenInput, activeInput, activeInputStore } from './activeInputStore.svelte';
export { type UIVisibility, type UIState, ui, toggleUIElement, uiStateManager, userPreferredState, setRouteContext } from './UIStore.svelte';

// System re-exports
export {
	getSystemState,
	setSystemState,
	setInitializationStage,
	updateServiceHealth,
	isServiceHealthy,
	getSystemMetrics,
	type SystemState,
	type ServiceStatus,
	type InitializationStage
} from '@shared/stores/system';
