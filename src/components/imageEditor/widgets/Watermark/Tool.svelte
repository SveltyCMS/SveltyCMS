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
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import WatermarkControls from '@src/components/imageEditor/toolbars/WatermarkControls.svelte';
	import { WatermarkItem } from './regions';

	// --- Svelte 5 State ---
	let watermarks: WatermarkItem[] = $state([]);
	let selected: WatermarkItem | null = $state(null);
	let transformer: Konva.Transformer | null = $state(null);
	let opacity = $state(0.8);
	let fileInput: HTMLInputElement;

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	// --- Lifecycle $effect ---
	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'watermark') {
			bindTool();
			imageEditorStore.setToolbarControls({
				component: WatermarkControls,
				props: {
					hasSelection: !!selected,
					onAddWatermark: () => fileInput?.click(),
					onDeleteWatermark: () => deleteSelected(),
					onPositionChange: (position: string) => selected?.snapTo(position),
					onApply: () => apply()
				}
			});
		} else {
			unbindTool();
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
			transformer = createTransformer(layer);
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
			attachTransformer(transformer!, item.node);
			layer.batchDraw();
		} catch (err) {
			console.error('Failed to load watermark image', err);
			item.destroy(); // Clean up if load fails
		}
	}

	function select(item: WatermarkItem) {
		selected = item;
		if (!transformer) return;
		attachTransformer(transformer, item.node);
		// Update controls to match selected item's opacity
		opacity = item.node.opacity();
	}

	function deselect() {
		selected = null;
		if (!transformer) return;
		attachTransformer(transformer, null);
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

	/**
	 * Creates a shared transformer for watermarks.
	 */
	function createTransformer(layer: Konva.Layer) {
		const tr = new Konva.Transformer({
			keepRatio: true,
			rotateEnabled: true,
			anchorSize: 10,
			borderStroke: '#0066ff',
			borderStrokeWidth: 2,
			anchorFill: '#0066ff',
			anchorStroke: '#ffffff',
			boundBoxFunc: (oldBox, newBox) => {
				return newBox.width < 10 || newBox.height < 10 ? oldBox : newBox;
			}
		});
		layer.add(tr);
		tr.hide();
		tr.moveToTop();
		return tr;
	}

	/**
	 * Attaches the shared transformer to a node.
	 */
	function attachTransformer(tr: Konva.Transformer, node?: Konva.Node | null) {
		try {
			if (!node) {
				tr.nodes([]);
				tr.hide();
				return;
			}
			tr.nodes([node]);
			tr.show();
			tr.forceUpdate();
			tr.moveToTop();
		} catch (e) {
			/* ignore */
		}
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
			cleanupWatermarks(true);
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
