<!--
@file: src/components/imageEditor/widgets/FineTune/Tool.svelte
@component
**Fine-Tune "Controller" Component**

Orchestrates the filter modules:
- Manages $state for all adjustments.
- Registers the toolbar UI.
- Applies filters (base + custom) in a debounced $effect.
- Handles "Compare" logic using Konva's cache.
- Implements the final 'apply' (bake) logic.
-->

<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import FineTuneControls from './Controls.svelte';
	import { type Adjustments, DEFAULT_ADJUSTMENTS, FILTER_PRESETS, getAdjustmentsByCategory } from './adjustments';
	import { applyBaseFilters } from './baseFilters';
	import { createCustomFilter } from './customFilters';

	// --- Svelte 5 State ---
	let adjustments = $state({ ...DEFAULT_ADJUSTMENTS });
	let activeAdjustment = $state<keyof Adjustments>('brightness');
	let activeCategory = $state('basic');
	let isComparing = $state(false);

	let { onCancel }: { onCancel: () => void } = $props();

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);
	// debounce timer for slider updates
	let filterDebounceTimer: number | null = null;

	// Store previous state for comparison
	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'finetune') {
			bindTool();
			updateToolbar();
		} else {
			unbindTool();
			if (imageEditorStore.state.toolbarControls?.component === FineTuneControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// Reactively update toolbar when state changes
	function updateToolbar() {
		if (imageEditorStore.state.activeState !== 'finetune') return;

		imageEditorStore.setToolbarControls({
			component: FineTuneControls,
			props: {
				activeAdjustment,
				activeCategory,
				value: adjustments[activeAdjustment] || 0,
				adjustments,
				showPresets: true,
				isComparing,
				onChange: (val: number) => {
					adjustments[activeAdjustment] = val;
				},
				onAdjustmentChange: (key: keyof Adjustments) => {
					activeAdjustment = key;
				},
				onCategoryChange: (cat: string) => {
					activeCategory = cat;
					// Auto-select first adjustment in category
					const adj = getAdjustmentsByCategory(cat as any)[0];
					if (adj) activeAdjustment = adj.key;
				},
				onPresetApply: (presetName: string) => {
					const preset = FILTER_PRESETS.find((p) => p.name === presetName);
					if (preset) {
						adjustments = { ...DEFAULT_ADJUSTMENTS, ...preset.adjustments };
					}
				},
				onReset: () => {
					adjustments[activeAdjustment] = 0;
				},
				onResetAll: () => {
					adjustments = { ...DEFAULT_ADJUSTMENTS };
				},
				onCompareToggle: toggleCompare,
				onAutoAdjust: autoAdjust,
				onCancel: () => onCancel(),
				onApply: () => apply()
			}
		});
	}

	// Re-run updateToolbar when dependencies change
	$effect(() => {
		updateToolbar();
	});

	// --- Core Filter Logic ---
	// This $effect watches for adjustment changes,
	// debounces them, and applies the Konva filters.
	$effect(() => {
		if (!_toolBound || isComparing) return;

		// Force dependency tracking by reading adjustments state here
		const currentAdjustments = $state.snapshot(adjustments);

		// Debounce to prevent thrashing on slider drag
		if (filterDebounceTimer) clearTimeout(filterDebounceTimer);

		filterDebounceTimer = window.setTimeout(() => {
			const { imageNode, layer } = imageEditorStore.state;
			if (!imageNode || !layer) return;

			applyFilters(imageNode, layer, currentAdjustments);
		}, 100); // 100ms debounce
	});

	function applyFilters(node: Konva.Image, layer: Konva.Layer, adj: Adjustments) {
		// 1. Prepare filter list
		const activeFilters: any[] = [];

		// Base Konva filters (Brighten, Contrast, HSL for saturation/hue)
		activeFilters.push(Konva.Filters.Brighten);
		activeFilters.push(Konva.Filters.Contrast);
		activeFilters.push(Konva.Filters.HSL);

		// 2. Check for slow, custom pixel-looping filters
		const needsCustom =
			adj.exposure !== 0 || adj.highlights !== 0 || adj.shadows !== 0 || adj.clarity !== 0 || adj.temperature !== 0 || (adj.tint && adj.tint !== 0);

		if (needsCustom) {
			activeFilters.push(createCustomFilter(adj));
		}

		// 3. Set filters on node
		node.filters(activeFilters);

		// 4. Update the actual properties
		applyBaseFilters(node, adj);

		// 5. Re-cache the node to apply all filters
		try {
			node.clearCache();
			node.cache();
			layer.batchDraw();
		} catch (e) {
			console.warn('Failed to apply filters:', e);
		}
	}

	function bindTool() {
		if (_toolBound) return;
		_toolBound = true;
		adjustments = { ...DEFAULT_ADJUSTMENTS };
	}

	function unbindTool() {
		if (!_toolBound) return;
		_toolBound = false;
		if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
	}

	function toggleCompare() {
		const { imageNode, layer } = imageEditorStore.state;
		if (!imageNode || !layer) return;

		isComparing = !isComparing;

		if (isComparing) {
			// Save current state and reset to defaults (or just clear filters)
			// Actually clearing filters is faster/cleaner for "Original" view
			imageNode.filters([]);
			imageNode.clearCache();
			// We need to reset base properties manually as well or they stick
			imageNode.brightness(0);
			imageNode.contrast(0);
			imageNode.saturation(0);
			layer.batchDraw();
		} else {
			// Restore
			applyFilters(imageNode, layer, $state.snapshot(adjustments));
		}
	}

	function autoAdjust() {
		// reliable "magic" values
		adjustments = {
			...DEFAULT_ADJUSTMENTS,
			contrast: 10,
			vibrance: 20,
			clarity: 10,
			highlights: -15,
			shadows: 15
		};
	}

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	// --- Parent Store API ---
	export function cleanup() {
		try {
			unbindTool();
		} catch (e) {
			/* ignore */
		}
	}
	export function saveState() {}
	export function beforeExit() {
		cleanup();
	}
</script>

<!-- Controls registered to master toolbar; no DOM toolbar here -->
