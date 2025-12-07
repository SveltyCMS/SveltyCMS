<!--
@file: src/routes/(app)/imageEditor/widgets/FineTune/Tool.svelte
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
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import FineTuneControls from '@src/components/imageEditor/toolbars/FineTuneControls.svelte';
	import { type Adjustments, DEFAULT_ADJUSTMENTS } from './adjustments';
	import { applyBaseFilters } from './baseFilters';
	import { createCustomFilter } from './customFilters';

	// --- Svelte 5 State ---
	let adjustments = $state({ ...DEFAULT_ADJUSTMENTS });
	let activeAdjustment = $state<keyof Adjustments>('brightness');

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	// debounce timer for slider updates
	let filterDebounceTimer: number | null = null;

	// --- Lifecycle $effect ---
	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'finetune') {
			bindTool();
			imageEditorStore.setToolbarControls({
				component: FineTuneControls,
				props: {
					activeAdjustment: activeAdjustment,
					value: adjustments[activeAdjustment],
					onChange: (value: number) => {
						adjustments[activeAdjustment] = value;
					},
					onAdjustmentChange: (key: keyof Adjustments) => {
						activeAdjustment = key;
					},
					onReset: () => resetAdjustment(),
					onApply: () => apply()
				}
			});
		} else {
			unbindTool();
			if (imageEditorStore.state.toolbarControls?.component === FineTuneControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// --- Core Filter Logic ---
	// This $effect watches for adjustment changes,
	// debounces them, and applies the Konva filters.
	$effect(() => {
		if (!_toolBound) return;

		// Debounce to prevent thrashing on slider drag
		if (filterDebounceTimer) clearTimeout(filterDebounceTimer);

		filterDebounceTimer = window.setTimeout(() => {
			const { imageNode, layer } = imageEditorStore.state;
			if (!imageNode || !layer) return;

			// 1. Apply fast, Konva-native filters (brightness, contrast, etc.)
			applyBaseFilters(imageNode, adjustments);

			// 2. Apply slow, custom pixel-looping filters
			const needsCustom = adjustments.exposure !== 0 || adjustments.highlights !== 0 || adjustments.shadows !== 0 || adjustments.clarity !== 0;

			if (needsCustom) {
				imageNode.filters([createCustomFilter(adjustments)]);
			} else {
				// CRITICAL: Set to empty array to prevent slow,
				// unnecessary pixel loop if all custom values are 0.
				imageNode.filters([]);
			}

			// 3. Re-cache the node to apply all filters
			imageNode.cache();
			layer.batchDraw();
		}, 100); // 100ms debounce
	});

	function bindTool() {
		if (_toolBound) return;
		_toolBound = true;
		// Save the current state (which should be 0s) as the 'reset' point
		adjustments = { ...DEFAULT_ADJUSTMENTS };
	}

	function unbindTool() {
		if (!_toolBound) return;
		_toolBound = false;
		if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
	}

	/**
	 * Toggles comparison view.
	 * This is the *most efficient* way:
	 * - clearCache() reverts to the pre-filter image.
	 * - cache() re-applies the filters.
	 */
	function resetAdjustment() {
		adjustments[activeAdjustment] = 0;
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
