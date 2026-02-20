<!--
@file: src/components/image-editor/widgets/FineTune/Tool.svelte
@component
**Fine-Tune "Controller" Component**

Orchestrates the filter modules using svelte-canvas compatible state.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { type Adjustments, DEFAULT_ADJUSTMENTS, FILTER_PRESETS, getAdjustmentsByCategory } from './adjustments';
	import FineTuneControls from './controls.svelte';

	// --- Svelte 5 State ---
	let activeAdjustment = $state<keyof Adjustments>('brightness');
	let activeCategory = $state('basic');
	let isComparing = $state(false);

	let { onCancel }: { onCancel: () => void } = $props();

	const storeState = imageEditorStore.state;

	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'finetune') {
			updateToolbar();
		} else if (imageEditorStore.state.toolbarControls?.component === FineTuneControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	// Reactively update toolbar when state changes
	function updateToolbar() {
		if (imageEditorStore.state.activeState !== 'finetune') {
			return;
		}

		imageEditorStore.setToolbarControls({
			component: FineTuneControls,
			props: {
				activeAdjustment,
				activeCategory,
				value: storeState.filters[activeAdjustment] || 0,
				adjustments: storeState.filters,
				showPresets: true,
				isComparing,
				onChange: (val: number) => {
					storeState.filters[activeAdjustment] = val;
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
						storeState.filters = {
							...DEFAULT_ADJUSTMENTS,
							...preset.adjustments
						};
					}
				},
				onReset: () => {
					storeState.filters[activeAdjustment] = 0;
				},
				onResetAll: () => {
					storeState.filters = { ...DEFAULT_ADJUSTMENTS };
				},
				onCompareToggle: () => (isComparing = !isComparing),
				onAutoAdjust: autoAdjust,
				onCancel: () => onCancel(),
				onApply: () => apply()
			}
		});
	}

	$effect(() => {
		updateToolbar();
	});

	function autoAdjust() {
		storeState.filters = {
			...DEFAULT_ADJUSTMENTS,
			contrast: 10,
			saturation: 20
		};
	}

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	export function saveState() {}
	export function beforeExit() {}
</script>
