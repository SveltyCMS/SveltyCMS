<!--
@file: src/routes/(app)/imageEditor/widgets/Watermark/Tool.svelte
@component
**Watermark Tool "Controller"**

Orchestrates the watermark lifecycle:
- Manages the $state list of WatermarkItem instances
- Handles selection and transformer
- Registers the toolbar UI
- Implements the 'apply' (bake) logic
-->

<script lang="ts">
	import Konva from 'konva';
	import { getContext } from 'svelte';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import WatermarkControls from './Controls.svelte';
	import { WatermarkItem } from './regions';
	import { createStyledTransformer, attachStyledTransformer } from '../transformerConfig';
	import type { WatermarkOptions } from '@src/utils/media/mediaModels';

	// --- Svelte 5 State ---
	let watermarks: WatermarkItem[] = $state([]);
	let selected: WatermarkItem | null = $state(null);
	let transformer: Konva.Transformer | null = $state(null);
	let opacity = $state(0.8);
	let fileInput: HTMLInputElement;

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);
	// guard to prevent loading preset multiple times
	let _presetLoaded = $state(false);
	let { onCancel }: { onCancel: () => void } = $props();

	// Get watermark preset from parent context (set by ImageEditorModal)
	const getWatermarkPreset = getContext<(() => WatermarkOptions | null) | undefined>('watermarkPreset');

	// --- Lifecycle $effect ---
	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'watermark') {
			bindTool();

			// Auto-load preset watermark if available and not already loaded
			const preset = getWatermarkPreset?.();
			if (preset?.url && watermarks.length === 0 && !_presetLoaded) {
				_presetLoaded = true;
				loadPresetWatermark(preset);
			}

			imageEditorStore.setToolbarControls({
				component: WatermarkControls,
				props: {
					hasSelection: !!selected,
					onAddWatermark: () => fileInput?.click(),
					onDeleteWatermark: () => deleteSelected(),
					onPositionChange: (position: string) => selected?.snapTo(position),
					onCancel: () => onCancel(),
					onApply: () => apply()
				}
			});
		} else {
			unbindTool();
			_presetLoaded = false; // Reset for next activation
			if (imageEditorStore.state.toolbarControls?.component === WatermarkControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// --- Event Binding ---
	function bindTool() {
		const { stage, layer } = imageEditorStore.state;
		if (!stage || !layer || _toolBound) return;
		_toolBound = true;

		if (!transformer) {
			transformer = createStyledTransformer(layer);
		}
		stage.on('click.watermark tap.watermark', onStageClick);
		stage.container().style.cursor = 'default';
	}

	function unbindTool() {
		const { stage } = imageEditorStore.state;
		if (!stage || !_toolBound) return;
		_toolBound = false;

		stage.off('click.watermark tap.watermark');
		if (stage.container()) stage.container().style.cursor = 'default';
		deselect();
	}

	// --- Event Handlers ---
	function onStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
		// Deselect if clicking on stage background
		if (e.target === e.target.getStage()) {
			deselect();
		}
	}

	// --- Preset Watermark Loading ---
	async function loadPresetWatermark(preset: WatermarkOptions) {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		try {
			// Fetch the watermark image from the preset URL
			const response = await fetch(preset.url);
			if (!response.ok) {
				console.warn('Failed to fetch preset watermark:', preset.url);
				return;
			}

			const blob = await response.blob();
			const filename = preset.url.split('/').pop() || 'preset-watermark.png';
			const file = new File([blob], filename, { type: blob.type || 'image/png' });

			const item = new WatermarkItem({
				id: crypto.randomUUID(),
				layer,
				imageGroup
			});

			item.onSelect(() => select(item));
			item.onDestroy(() => {
				watermarks = watermarks.filter((w) => w.id !== item.id);
				if (selected?.id === item.id) deselect();
			});

			watermarks = [...watermarks, item];
			select(item);

			// Load with preset opacity (convert percentage scale to 0-1 if needed)
			const presetOpacity = typeof preset.scale === 'number' && preset.scale > 1 ? preset.scale / 100 : (preset.scale ?? 0.8);

			await item.loadImage(file, {
				opacity: presetOpacity,
				stageWidth: stage.width(),
				stageHeight: stage.height()
			});

			// Apply preset position if specified
			if (preset.position) {
				item.snapTo(preset.position);
			}

			attachStyledTransformer(transformer!, item.node);
			layer.batchDraw();
		} catch (err) {
			console.error('Failed to load preset watermark', err);
		}
	}

	// --- Watermark Lifecycle ---
	async function addWatermark(file: File) {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		const item = new WatermarkItem({
			id: crypto.randomUUID(),
			layer,
			imageGroup
		});

		item.onSelect(() => select(item));
		item.onDestroy(() => {
			watermarks = watermarks.filter((w) => w.id !== item.id);
			if (selected?.id === item.id) deselect();
		});

		watermarks = [...watermarks, item];
		select(item);

		try {
			// Asynchronously load the image file
			await item.loadImage(file, {
				opacity: opacity,
				stageWidth: stage.width(),
				stageHeight: stage.height()
			});
			// Attach transformer *after* image is loaded and sized
			attachStyledTransformer(transformer!, item.node);
			layer.batchDraw();
		} catch (err) {
			console.error('Failed to load watermark image', err);
			item.destroy(); // Clean up if load fails
		}
	}

	function select(item: WatermarkItem) {
		selected = item;
		if (!transformer) return;
		attachStyledTransformer(transformer, item.node);
		// Update controls to match selected item's opacity
		opacity = item.node.opacity();
	}

	function deselect() {
		selected = null;
		if (!transformer) return;
		attachStyledTransformer(transformer, null);
	}

	function deleteSelected() {
		if (!selected) return;
		selected.destroy();
		// State update is handled by the 'onDestroy' callback
	}

	function cleanupWatermarks(destroy = true) {
		deselect();
		if (destroy) {
			[...watermarks].forEach((w) => w.destroy());
			watermarks = [];
		} else {
			// Hide UI for baking
			watermarks.forEach((w) => w.disableInteraction());
		}
		imageEditorStore.state.layer?.batchDraw();
	}

	// --- Tool Actions ---
	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			addWatermark(target.files[0]);
		}
		// Reset input so the same file can be chosen again
		target.value = '';
	}

	// --- Parent Store API ---
	export function cleanup() {
		try {
			unbindTool();
			cleanupWatermarks(false); // Bake instead of destroy
			transformer?.destroy();
			transformer = null;
		} catch (e) {
			/* ignore */
		}
	}
	export function saveState() {}
	export function beforeExit() {
		cleanup();
	}
</script>

<input type="file" accept="image/png, image/svg+xml" class="hidden" bind:this={fileInput} onchange={handleFileChange} />

<!-- Controls registered to master toolbar; no DOM toolbar here -->
