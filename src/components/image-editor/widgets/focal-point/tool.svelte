<!--
@file src\components\image-editor\widgets\focal-point\tool.svelte
@component
**FocalPoint Tool**

Allows users to set the focal point using svelte-canvas compatible state.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import FocalPointControls from './controls.svelte';
	import type { FocalPoint } from './types';

	let { onCancel }: { onCancel: () => void } = $props();
	const storeState = imageEditorStore.state;

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'focalpoint') {
			imageEditorStore.setToolbarControls({
				component: FocalPointControls,
				props: {
					focalX: Math.round((storeState.focalPoint?.x ?? 0.5) * 100),
					focalY: Math.round((storeState.focalPoint?.y ?? 0.5) * 100),
					onReset: () => (storeState.focalPoint = { x: 0.5, y: 0.5 }),
					onCancel: () => onCancel(),
					onApply: apply
				}
			});
		} else if (imageEditorStore.state.toolbarControls?.component === FocalPointControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	// Hit testing
	export function handleMouseDown(e: MouseEvent, width: number, height: number) {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) {
			return;
		}

		const rect = (e.target as HTMLElement).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		const ix = (offsetX - centerX) / zoom + imageElement.width / 2;
		const iy = (offsetY - centerY) / zoom + imageElement.height / 2;

		if (ix >= 0 && ix <= imageElement.width && iy >= 0 && iy <= imageElement.height) {
			storeState.focalPoint = {
				x: ix / imageElement.width,
				y: iy / imageElement.height
			};
		}
	}

	const renderFocalPoint = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { zoom, translateX, translateY, imageElement, focalPoint } = storeState;
		if (!imageElement) {
			return;
		}

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;
		const fp = focalPoint || { x: 0.5, y: 0.5 };
		const fx = offsetX + imageElement.width * fp.x;
		const fy = offsetY + imageElement.height * fp.y;

		// Draw Crosshair
		context.strokeStyle = '#ff0000';
		context.lineWidth = 2 / zoom;
		context.beginPath();
		context.moveTo(fx - 20 / zoom, fy);
		context.lineTo(fx + 20 / zoom, fy);
		context.moveTo(fx, fy - 20 / zoom);
		context.lineTo(fx, fy + 20 / zoom);
		context.stroke();

		// Draw Circle
		context.beginPath();
		context.arc(fx, fy, 5 / zoom, 0, Math.PI * 2);
		context.fillStyle = '#ff0000';
		context.fill();

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {}
</script>

<Layer render={renderFocalPoint} />
