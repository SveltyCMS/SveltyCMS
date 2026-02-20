<!--
@file: src/components/image-editor/widgets/Watermark/Tool.svelte
@component
Watermark tool using svelte-canvas compatible state.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import WatermarkControls from './controls.svelte';

	let { onCancel }: { onCancel: () => void } = $props();

	let selectedId = $state<string | null>(null);
	let opacity = $state(0.8);
	let currentSize = $state(100);

	const storeState = imageEditorStore.state;

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'watermark') {
			updateToolbar();
		} else if (imageEditorStore.state.toolbarControls?.component === WatermarkControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	function updateToolbar() {
		imageEditorStore.setToolbarControls({
			component: WatermarkControls,
			props: {
				onAddImage: () => {},
				onAddText: () => {},
				onDeleteWatermark: () => {},
				onPositionChange: () => {},
				onOpacityChange: (v: number) => (opacity = v),
				onSizeChange: (v: number) => (currentSize = v),
				onCancel: () => {
					storeState.watermarks = [];
					onCancel();
				},
				onApply: apply,
				hasSelection: !!selectedId,
				currentOpacity: opacity,
				currentSize,
				watermarkCount: storeState.watermarks.length
			}
		});
	}

	$effect(() => {
		if (imageEditorStore.state.activeState === 'watermark') {
			updateToolbar();
		}
	});

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	const renderWatermarks = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { watermarks, zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) {
			return;
		}

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;

		for (const wm of watermarks) {
			context.globalAlpha = wm.opacity || 0.8;
			if (wm.type === 'text') {
				context.font = `${wm.fontSize || 48}px Arial`;
				context.fillStyle = wm.color || 'white';
				context.fillText(wm.text, wm.x + offsetX, wm.y + offsetY);
			}
		}

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {}
</script>

<Layer render={renderWatermarks} />
