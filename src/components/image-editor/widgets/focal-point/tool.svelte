<!--
@file src\components\image-editor\widgets\focal-point\tool.svelte
@component
**FocalPoint Tool**

Allows users to set the focal point using svelte-canvas compatible state.
Store values are in percentage (0-100) range for consistency with UI controls.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import FocalPointControls from './controls.svelte';

	const storeState = imageEditorStore.state;
	let isDraggingFocal = $state(false);

	// Convert percentage (0-100) to decimal (0-1) for internal calculations
	function pctToDecimal(pct: number): number {
		return pct / 100;
	}

	// Convert decimal (0-1) to percentage (0-100) for display
	function decimalToPct(dec: number): number {
		return Math.round(dec * 100);
	}

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'focalpoint') {
			// Store uses percentage (0-100), controls use percentage
			imageEditorStore.setToolbarControls({
				component: FocalPointControls,
				props: {
					focalX: storeState.focalPoint?.x ?? 50,
					focalY: storeState.focalPoint?.y ?? 50,
					onReset: () => (storeState.focalPoint = { x: 50, y: 50 }),
					onPointChange: (nextPoint: { x: number; y: number }) => {
						storeState.focalPoint = {
							x: Math.max(0, Math.min(100, Math.round(nextPoint.x))),
							y: Math.max(0, Math.min(100, Math.round(nextPoint.y)))
						};
					}
				}
			});
		} else if (imageEditorStore.state.toolbarControls?.component === FocalPointControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	// Hit testing
	export function handleMouseDown(e: MouseEvent, width: number, height: number) {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) {
			return;
		}

		const rect = ((e.currentTarget as HTMLElement) ?? (e.target as HTMLElement)).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		const ix = (offsetX - centerX) / zoom + imageElement.width / 2;
		const iy = (offsetY - centerY) / zoom + imageElement.height / 2;

		if (ix >= 0 && ix <= imageElement.width && iy >= 0 && iy <= imageElement.height) {
			// Store uses percentage (0-100)
			storeState.focalPoint = {
				x: decimalToPct(ix / imageElement.width),
				y: decimalToPct(iy / imageElement.height)
			};
			isDraggingFocal = true;
		}
	}

	export function handleMouseMove(e: MouseEvent, width: number, height: number) {
		if (!isDraggingFocal) {
			return;
		}

		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) {
			return;
		}

		const rect = ((e.currentTarget as HTMLElement) ?? (e.target as HTMLElement)).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;
		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		const ix = (offsetX - centerX) / zoom + imageElement.width / 2;
		const iy = (offsetY - centerY) / zoom + imageElement.height / 2;

		storeState.focalPoint = {
			x: Math.max(0, Math.min(100, decimalToPct(ix / imageElement.width))),
			y: Math.max(0, Math.min(100, decimalToPct(iy / imageElement.height)))
		};
	}

	export function handleMouseUp() {
		if (isDraggingFocal) {
			imageEditorStore.takeSnapshot();
		}
		isDraggingFocal = false;
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
		// Store uses percentage (0-100), convert to decimal (0-1) for positioning
		const fp = focalPoint || { x: 50, y: 50 };
		const fx = offsetX + imageElement.width * pctToDecimal(fp.x);
		const fy = offsetY + imageElement.height * pctToDecimal(fp.y);

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

		// Draw target rings
		context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
		context.lineWidth = 1 / zoom;
		context.beginPath();
		context.arc(fx, fy, 15 / zoom, 0, Math.PI * 2);
		context.stroke();
		context.beginPath();
		context.arc(fx, fy, 25 / zoom, 0, Math.PI * 2);
		context.stroke();

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {}
</script>

<Layer render={renderFocalPoint} />
