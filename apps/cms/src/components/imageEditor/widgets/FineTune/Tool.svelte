<!--
@file shared/components/src/imageEditor/widgets/FineTune/Tool.svelte
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
	import { imageEditorStore } from '@cms/stores/imageEditorStore.svelte';
	import FineTuneControls from './Controls.svelte';
	import { type Adjustments, DEFAULT_ADJUSTMENTS } from './adjustments';
	import { applyBaseFilters } from './baseFilters';
	import { createCustomFilter } from './customFilters';

	// --- Svelte 5 State ---
	let adjustments = $state({ ...DEFAULT_ADJUSTMENTS });
	let activeAdjustment = $state<keyof Adjustments>('brightness');

	const adjustments_list = [
		{ key: 'brightness', label: 'Brightness', icon: 'mdi:brightness-6' },
		{ key: 'contrast', label: 'Contrast', icon: 'mdi:contrast-box' },
		{ key: 'saturation', label: 'Saturation', icon: 'mdi:palette' },
		{ key: 'exposure', label: 'Exposure', icon: 'mdi:brightness-7' },
		{ key: 'highlights', label: 'Highlights', icon: 'mdi:white-balance-sunny' },
		{ key: 'shadows', label: 'Shadows', icon: 'mdi:weather-night' },
		{ key: 'temperature', label: 'Temperature', icon: 'mdi:thermometer' },
		{ key: 'clarity', label: 'Clarity', icon: 'mdi:crystal-ball' },
		{ key: 'vibrance', label: 'Vibrance', icon: 'mdi:vibrate' }
	];
	let { onCancel }: { onCancel: () => void } = $props();

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
					activeIcon: adjustments_list.find((a) => a.key === activeAdjustment)?.icon,
					value: adjustments[activeAdjustment],
					onChange: (value: number) => {
						adjustments[activeAdjustment] = value;
					},
					onAdjustmentChange: (key: keyof Adjustments) => {
						activeAdjustment = key;
					},
					onReset: () => resetAdjustment(),
					onCancel: () => onCancel(),
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

		// Force dependency tracking by reading adjustments state here
		const currentAdjustments = JSON.parse(JSON.stringify(adjustments));

		// Debounce to prevent thrashing on slider drag
		if (filterDebounceTimer) clearTimeout(filterDebounceTimer);

		filterDebounceTimer = window.setTimeout(() => {
			const { imageNode, layer } = imageEditorStore.state;
			if (!imageNode || !layer) return;

			// Log for debugging
			console.log('Applying FineTune adjustments:', currentAdjustments);

			// 1. Prepare filter list
			const activeFilters = [];

			// Base Konva filters (Brighten, Contrast, HSL for saturation/hue)
			activeFilters.push(Konva.Filters.Brighten);
			activeFilters.push(Konva.Filters.Contrast);
			activeFilters.push(Konva.Filters.HSL);

			// 2. Check for slow, custom pixel-looping filters
			const needsCustom =
				adjustments.exposure !== 0 ||
				adjustments.highlights !== 0 ||
				adjustments.shadows !== 0 ||
				adjustments.clarity !== 0 ||
				adjustments.temperature !== 0;
			if (needsCustom) {
				activeFilters.push(createCustomFilter(currentAdjustments));
			}

			// 3. Set filters on node
			imageNode.filters(activeFilters);

			// 4. Update the actual properties (brightness, contrast, saturation, hue)
			applyBaseFilters(imageNode, currentAdjustments);

			// 5. Re-cache the node to apply all filters
			imageNode.clearCache();
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
