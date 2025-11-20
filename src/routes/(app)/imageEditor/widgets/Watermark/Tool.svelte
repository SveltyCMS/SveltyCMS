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
	import WatermarkControls from './Controls.svelte';
	import { WatermarkItem } from './regions';

	// --- Svelte 5 State ---
	let watermarks: WatermarkItem[] = $state([]);
	let selected: WatermarkItem | null = $state(null);
	let transformer: Konva.Transformer | null = $state(null);
	let opacity = $state(0.8);

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	// Svelte 5: use callback props via $props
	const props = $props<{ onWatermarkApplied?: () => void }>();

	// --- Lifecycle $effect ---
	// Binds/unbounds the tool and registers the toolbar
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'watermark') {
			bindTool();
			imageEditorStore.setToolbarControls({
				component: WatermarkControls,
				props: {
					get opacity() {
						return opacity;
					},
					onOpacityChange: (v: number) => {
						opacity = v;
						selected?.setOpacity(v);
					},
					onAddWatermark: (file: File) => {
						addWatermark(file);
					},
					onSnap: (position: string) => {
						selected?.snapTo(position);
					},
					onDelete: () => deleteSelected(),
					onDone: () => apply()
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
	function onStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
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

	/**
	 * Bakes the watermarks permanently into the imageNode.
	 * This follows the same robust logic as the Annotate tool.
	 */
	async function apply() {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		// 1. Hide all UI (transformer, etc.)
		cleanupWatermarks(false); // false = don't destroy, just hide

		// 2. Capture the entire stage (with watermarks)
		const dataURL = stage.toDataURL({ pixelRatio: 1 });

		// 3. Load the baked image
		const newImage = new Image();
		await new Promise<void>((res) => {
			newImage.onload = () => res();
			newImage.src = dataURL;
		});

		// 4. Update the main imageNode
		imageNode.image(newImage);

		// 5. Reset all transforms (they are now baked in)
		imageNode.width(newImage.width);
		imageNode.height(newImage.height);
		imageNode.x(-newImage.width / 2);
		imageNode.y(-newImage.height / 2);
		imageNode.filters([]);
		imageNode.cache();

		imageGroup.scale({ x: 1, y: 1 });
		imageGroup.rotation(0);

		// 6. Fully destroy all watermark instances
		cleanupWatermarks(true);

		// 7. Re-center the 1:1 group
		centerImageInStage();

		// 8. Finalize
		layer.batchDraw();
		props.onWatermarkApplied?.(); // Callback for snapshot
		imageEditorStore.setActiveState('');
	}

	function centerImageInStage() {
		const { stage, imageGroup } = imageEditorStore.state;
		if (!stage || !imageGroup) return;
		imageGroup.position({ x: stage.width() / 2, y: stage.height() / 2 });
		stage.batchDraw();
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

<!-- Controls registered to master toolbar; no DOM toolbar here -->
