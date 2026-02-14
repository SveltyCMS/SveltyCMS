<!--
@file: src/components/imageEditor/widgets/Blur/Tool.svelte
@component
Controller for Blur tool using svelte-canvas compatible state.
-->
<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import Controls from '@src/components/imageEditor/toolbars/BlurControls.svelte';
	import type { BlurPattern, BlurShape } from './types';
	import { Layer } from 'svelte-canvas';


	// reactive tool state
	let blurStrength = $state(20);
	let pattern = $state<BlurPattern>('blur');
	let shape = $state<BlurShape>('rectangle');
	let activeId = $state<string | null>(null);

	let { onCancel }: { onCancel: () => void } = $props();
	const storeState = imageEditorStore.state;

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'blur') {
			updateToolbar();
		} else {
			if (imageEditorStore.state.toolbarControls?.component === Controls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	function updateToolbar() {
		imageEditorStore.setToolbarControls({
			component: Controls,
			props: {
				blurStrength,
				pattern,
				shape,
				hasActiveRegion: !!activeId,
				regionCount: storeState.blurRegions.length,
				onStrengthChange: (v: number) => (blurStrength = v),
				onPatternChange: (p: BlurPattern) => (pattern = p),
				onShapeChange: (s: BlurShape) => (shape = s),
				onAddRegion: () => {},
				onDeleteRegion: () => {},
				onRotateLeft: () => {},
				onRotateRight: () => {},
				onFlipHorizontal: () => {},
				onReset: () => (storeState.blurRegions = []),
				onCancel: () => onCancel(),
				onApply: apply
			}
		});
	}

	$effect(() => {
		if (imageEditorStore.state.activeState === 'blur') {
			updateToolbar();
		}
	});

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	const renderBlurRegions = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { blurRegions, zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return;

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;

		for (const region of blurRegions) {
			// Placeholder: draw semi-transparent rectangles for blur regions
			context.fillStyle = 'rgba(255, 255, 255, 0.3)';
			context.fillRect(region.x + offsetX, region.y + offsetY, region.width, region.height);
		}

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {}
</script>

<Layer render={renderBlurRegions} />
