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
	import FineTuneControls from './Controls.svelte';
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

	// Svelte 5: callback props instead of event dispatcher
	const props = $props<{ onFineTuneApplied?: () => void; onFineTuneReset?: () => void }>();

	// --- Lifecycle $effect ---
	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'finetune') {
			bindTool();
			imageEditorStore.setToolbarControls({
				component: FineTuneControls,
				props: {
					// Pass runes as getters
					get activeAdjustment() {
						return activeAdjustment;
					},
					get value() {
						return adjustments[activeAdjustment];
					},
					// ---
					onChange: (value: number) => {
						adjustments[activeAdjustment] = value;
					},
					onAdjustmentChange: (key: keyof Adjustments) => {
						activeAdjustment = key;
					},
					onReset: () => reset(),
					onApply: () => apply(),
					onComparisonStart: () => onCompare(true),
					onComparisonEnd: () => onCompare(false)
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
		// Reset to default state when tool is closed
		reset(false); // false = don't dispatch event
	}

	/**
	 * Toggles comparison view.
	 * This is the *most efficient* way:
	 * - clearCache() reverts to the pre-filter image.
	 * - cache() re-applies the filters.
	 */
	function onCompare(isComparing: boolean) {
		const { imageNode, layer } = imageEditorStore.state;
		if (!imageNode || !layer) return;

		if (isComparing) {
			imageNode.clearCache(); // Show original
		} else {
			imageNode.cache(); // Re-apply filters
		}
		layer.batchDraw();
	}

	/**
	 * Resets all adjustments to their initial state.
	 */
	function reset(dispatchUpdate = true) {
		const { imageNode, layer } = imageEditorStore.state;
		if (imageNode && layer) {
			// Apply default filters
			applyBaseFilters(imageNode, DEFAULT_ADJUSTMENTS);
			imageNode.filters([]); // Clear custom filters
			imageNode.cache(); // Apply the reset
			layer.batchDraw();
		}
		adjustments = { ...DEFAULT_ADJUSTMENTS };
		if (dispatchUpdate) {
			props.onFineTuneReset?.(); // For snapshot
		}
	}

	/**
	 * Bakes the filters permanently into the imageNode.
	 */
	async function apply() {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		// 1. Hide UI (not needed for this tool, but good practice)
		// ...

		// 2. Capture the entire stage (with filters applied)
		const dataURL = stage.toDataURL({ pixelRatio: 1 });

		// 3. Load the baked image
		const newImage = new Image();
		await new Promise<void>((res) => {
			newImage.onload = () => res();
			newImage.src = dataURL;
		});

		// 4. Update the main imageNode
		imageNode.image(newImage);

		// 5. Reset all filters and transforms (they are now baked in)
		imageNode.filters([]);
		applyBaseFilters(imageNode, DEFAULT_ADJUSTMENTS); // Reset Konva properties
		imageNode.width(newImage.width);
		imageNode.height(newImage.height);
		imageNode.x(-newImage.width / 2);
		imageNode.y(-newImage.height / 2);
		imageNode.cache(); // Re-cache new base image

		imageGroup.scale({ x: 1, y: 1 });
		imageGroup.rotation(0);

		// 6. Reset tool state
		cleanup();

		// 7. Re-center the 1:1 group
		centerImageInStage();

		// 8. Finalize
		layer.batchDraw();
		props.onFineTuneApplied?.(); // Callback for snapshot
		imageEditorStore.setActiveState('');
	}

	function centerImageInStage() {
		const { stage, imageGroup } = imageEditorStore.state;
		if (!stage || !imageGroup) return;
		imageGroup.position({ x: stage.width() / 2, y: stage.height() / 2 });
		stage.batchDraw();
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
