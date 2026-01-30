<!--
@file: src/components/imageEditor/widgets/Watermark/Tool.svelte
@component
Watermark tool with advanced features
-->
<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import { attachStyledTransformer } from '@utils/transformerUtils';
	import WatermarkControls from './Controls.svelte';
	import { WatermarkItem } from './regions';

	let { onCancel }: { onCancel: () => void } = $props();

	let watermarks = $state<WatermarkItem[]>([]);
	let selected = $state<WatermarkItem | null>(null);
	let transformer: Konva.Transformer | null = null;
	let opacity = $state(0.8);
	let currentSize = $state(100);

	let isActive = $state(false);

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'watermark') {
			if (!isActive) init();
			updateToolbar();
		} else {
			if (isActive) destroy();
		}
	});

	// Reactively update toolbar controls
	function updateToolbar() {
		imageEditorStore.setToolbarControls({
			component: WatermarkControls,
			props: {
				onAddImage: () => document.getElementById('watermark-upload')?.click(),
				onAddText: () => addTextWatermark('Watermark'),
				onDeleteWatermark: deleteSelected,
				onPositionChange: (pos: string) => selected?.snapTo(pos),
				onOpacityChange: handleOpacityChange,
				onSizeChange: handleSizeChange,
				onTileToggle: handleTileToggle,
				onCancel: () => {
					clearAll();
					onCancel();
				},
				onApply: apply,
				hasSelection: !!selected,
				currentOpacity: opacity,
				currentSize,
				isTiled: selected?.isTiled,
				watermarkCount: watermarks.length
			}
		});
	}

	function init() {
		const { stage, layer } = imageEditorStore.state;
		if (!stage || !layer) return;

		isActive = true;

		// Setup transformer
		transformer = new Konva.Transformer({
			nodes: [],
			centeredScaling: true
		});
		attachStyledTransformer(transformer);
		layer.add(transformer);

		// Click on empty stage -> deselect
		stage.on('click tap', (e) => {
			// e.target is the actual shape clicked
			const target = e.target as unknown as Konva.Node;
			// Check if we clicked on stage or layer (background)
			if (target === stage || target === layer) {
				deselect();
			}
		});
	}

	function select(item: WatermarkItem) {
		selected = item;
		transformer?.nodes([item.node]);
		transformer?.moveToTop();
		imageEditorStore.state.layer?.batchDraw();
		updateToolbar(); // Update tool state in toolbar
	}

	function deselect() {
		selected = null;
		transformer?.nodes([]);
		imageEditorStore.state.layer?.batchDraw();
		updateToolbar();
	}

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files?.length) return;
		const file = input.files[0];

		const { stage, layer, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageGroup) return;

		const item = new WatermarkItem({
			id: crypto.randomUUID(),
			type: 'image',
			layer,
			imageGroup
		});

		item.onSelect(() => select(item));
		item.onDestroy(() => {
			watermarks = watermarks.filter((w) => w.id !== item.id);
			if (selected?.id === item.id) deselect();
		});

		try {
			await item.loadImage(file, {
				stageWidth: stage.width(),
				stageHeight: stage.height(),
				opacity
			});

			watermarks = [...watermarks, item];
			select(item);
			layer.batchDraw();
		} catch (err) {
			console.error('Failed to load watermark', err);
			item.destroy();
		}

		input.value = '';
	}

	// Add text watermark support
	async function addTextWatermark(text: string) {
		const { stage, layer, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageGroup) return;

		const item = new WatermarkItem({
			id: crypto.randomUUID(),
			type: 'text',
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

		item.createText({
			text,
			opacity,
			stageWidth: stage.width(),
			stageHeight: stage.height()
		});

		if (transformer) {
			attachStyledTransformer(transformer, item.node);
		}
		layer.batchDraw();
	}

	// Add opacity control
	function handleOpacityChange(newOpacity: number) {
		opacity = newOpacity;
		selected?.setOpacity(newOpacity);
	}

	// Add size control
	function handleSizeChange(percentage: number) {
		currentSize = percentage;
		selected?.setSize(percentage);
	}

	// Add tile toggle
	function handleTileToggle() {
		const { stage } = imageEditorStore.state;
		if (!selected || !stage) return;

		selected.toggleTiling({
			opacity,
			stageWidth: stage.width(),
			stageHeight: stage.height()
		});
		updateToolbar();
	}

	function deleteSelected() {
		if (selected) {
			selected.destroy();
			deselect();
		}
	}

	function clearAll() {
		watermarks.forEach((w) => w.destroy());
		watermarks = [];
		deselect();
	}

	function apply() {
		// Bake watermarks
		watermarks.forEach((w) => w.disableInteraction());
		transformer?.destroy();
		transformer = null;

		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	function destroy() {
		isActive = false;
		transformer?.destroy();
		const { stage } = imageEditorStore.state;
		if (stage) {
			stage.off('click tap');
		}
		// If exiting without apply, assume cancel?
		// Actually, `onCancel` prop handles explicit cancel, this is clean up.
		// We shouldn't destroy watermarks here if we are applying.
		// But in this logic, 'apply' calls cleanup via state change.
		// Wait, 'apply' should bake, whereas 'cancel' should destroy.
		// Current logic: destroy just cleans up listeners and transformer.
		// Watermarks nodes remain (baked if applied, or they linger if just switching tabs?
		// Ideally, we treat 'apply' as 'bake to image' and otherwise they are temp.
		// For now, if watermarks are in array, clear them unless applied.
		// But 'apply' sets state to '', triggering this.
		// So we rely on 'apply' to disable interaction (bake) and 'cancel' to clearAll.
	}

	export function cleanup() {
		try {
			destroy();
		} catch (e) {
			/* ignore */
		}
	}

	export function saveState() {}
	export function beforeExit() {
		destroy();
	}
</script>

<input type="file" id="watermark-upload" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden" onchange={handleUpload} />
