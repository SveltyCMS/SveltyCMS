<!--
@file: src/components/image-editor/widgets/FineTune/Tool.svelte
@component
**Fine-Tune "Controller" Component**

Orchestrates the filter modules using svelte-canvas compatible state.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { type Adjustments, DEFAULT_ADJUSTMENTS, FILTER_PRESETS, getAdjustmentConfig, getAdjustmentsByCategory } from './adjustments';
	import FineTuneControls from './controls.svelte';

	// --- Svelte 5 State ---
	let activeAdjustment = $state<keyof Adjustments>('brightness');
	let activeCategory = $state('basic');
	let isComparing = $state(false);

	const storeState = imageEditorStore.state;

	// Ensure all filter keys exist in state
	$effect(() => {
		if (imageEditorStore.state.activeState === 'finetune') {
			// Ensure all filter keys exist
			const currentFilters = storeState.filters;
			let needsUpdate = false;
			for (const [key, defaultValue] of Object.entries(DEFAULT_ADJUSTMENTS)) {
				if (currentFilters[key] === undefined) {
					currentFilters[key] = defaultValue;
					needsUpdate = true;
				}
			}
			if (needsUpdate) {
				storeState.filters = { ...currentFilters };
			}
		}
	});

	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'finetune') {
			updateToolbar();
		} else if (imageEditorStore.state.toolbarControls?.component === FineTuneControls) {
			imageEditorStore.setToolbarControls(null);
			imageEditorStore.setCompareMode(false);
		}
	});

	// Reactively update toolbar when state changes
	function updateToolbar() {
		if (imageEditorStore.state.activeState !== 'finetune') {
			return;
		}

		// Get current value, defaulting to 0 if not set
		const currentValue = storeState.filters[activeAdjustment];
		const currentAdjustments = storeState.filters;

		imageEditorStore.setToolbarControls({
			component: FineTuneControls,
			props: {
				activeAdjustment,
				activeCategory,
				value: currentValue ?? 0,
				adjustments: currentAdjustments,
				showPresets: true,
				isComparing,
				onChange: (val: number) => {
					storeState.filters = {
						...storeState.filters,
						[activeAdjustment]: val
					};
				},
				onAdjustmentChange: (key: keyof Adjustments) => {
					activeAdjustment = key;
				},
				onCategoryChange: (cat: string) => {
					activeCategory = cat;
					const adj = getAdjustmentsByCategory(cat as any)[0];
					if (adj) {
						activeAdjustment = adj.key;
					}
				},
				onPresetApply: (presetName: string) => {
					const preset = FILTER_PRESETS.find((p) => p.name === presetName);
					if (preset) {
						imageEditorStore.takeSnapshot();
						imageEditorStore.setCompareMode(false);
						storeState.filters = {
							...DEFAULT_ADJUSTMENTS,
							...preset.adjustments
						};
						const firstChangedKey = (Object.keys(preset.adjustments)[0] as keyof Adjustments | undefined) ?? 'brightness';
						activeAdjustment = firstChangedKey;
						const presetConfig = getAdjustmentConfig(firstChangedKey);
						if (presetConfig) {
							activeCategory = presetConfig.category;
						}
					}
				},
				onReset: () => {
					storeState.filters = {
						...storeState.filters,
						[activeAdjustment]: DEFAULT_ADJUSTMENTS[activeAdjustment] ?? 0
					};
				},
				onResetAll: () => {
					storeState.filters = { ...DEFAULT_ADJUSTMENTS };
				},
				onCompareToggle: () => {
					isComparing = !isComparing;
					imageEditorStore.setCompareMode(isComparing);
				},
				onAutoAdjust: autoAdjust
			}
		});
	}

	$effect(() => {
		// Update toolbar when filters change or active adjustment changes
		updateToolbar();
	});

	function autoAdjust() {
		storeState.filters = {
			...DEFAULT_ADJUSTMENTS,
			contrast: 10,
			saturation: 20
		};
	}

	export function saveState() {}
	export function beforeExit() {}
</script>
