<!--
@file: src/components/image-editor/widgets/Crop/Tool.svelte
@component
**Crop Tool "Controller"**

Orchestrates crop state using svelte-canvas compatible state.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import CropControls from './controls.svelte';
	import type { CropShape } from './types';

	let cropShape = $state<CropShape>('rectangle');

	const storeState = imageEditorStore.state;

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'crop') {
			updateToolbar();
			// Initialize crop if not set
			if (!storeState.crop && storeState.imageElement) {
				const img = storeState.imageElement;
				storeState.crop = {
					x: img.width * 0.1,
					y: img.height * 0.1,
					width: img.width * 0.8,
					height: img.height * 0.8
				};
			}
		} else if (imageEditorStore.state.toolbarControls?.component === CropControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	function updateToolbar() {
		imageEditorStore.setToolbarControls({
			component: CropControls,
			props: {
				cropShape,
				onRotateLeft: () => (storeState.rotation -= 90),
				onRotateRight: () => (storeState.rotation += 90),
				onFlipHorizontal: () => (storeState.flipH = !storeState.flipH),
				onCropShapeChange: (s: CropShape) => {
					cropShape = s;
				},
				onAspectRatio: (r: number | null) => {
					if (r === 1) {
						cropShape = cropShape === 'circular' ? 'circular' : 'square';
					} else {
						cropShape = 'rectangle';
					}
				}
			}
		});
	}

	$effect(() => {
		if (imageEditorStore.state.activeState === 'crop') {
			updateToolbar();
		}
	});

	// Interactive state
	let activeHandle = $state<string | null>(null);
	let isDraggingCrop = $state(false);
	let lastPointerPos = { x: 0, y: 0 };

	const HANDLE_SIZE = 12;

	// Helper to convert screen to image coordinates
	function screenToImage(screenX: number, screenY: number, width: number, height: number) {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) {
			return { x: 0, y: 0 };
		}

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		return {
			x: (screenX - centerX) / zoom + imageElement.width / 2,
			y: (screenY - centerY) / zoom + imageElement.height / 2
		};
	}

	// Export handlers for EditorCanvas to call
	export function handleMouseDown(e: MouseEvent, width: number, height: number) {
		const { crop } = storeState;
		if (!crop) {
			return;
		}

		const rect = (e.target as HTMLElement).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const pos = screenToImage(offsetX, offsetY, width, height);

		// Hit test handles
		const handles = [
			{ id: 'tl', x: crop.x, y: crop.y },
			{ id: 'tr', x: crop.x + crop.width, y: crop.y },
			{ id: 'bl', x: crop.x, y: crop.y + crop.height },
			{ id: 'br', x: crop.x + crop.width, y: crop.y + crop.height }
		];

		const hitHandle = handles.find(
			(h) => Math.abs(h.x - pos.x) < HANDLE_SIZE / storeState.zoom && Math.abs(h.y - pos.y) < HANDLE_SIZE / storeState.zoom
		);

		if (hitHandle) {
			activeHandle = hitHandle.id;
		} else if (pos.x > crop.x && pos.x < crop.x + crop.width && pos.y > crop.y && pos.y < crop.y + crop.height) {
			isDraggingCrop = true;
		}

		lastPointerPos = { x: pos.x, y: pos.y };
	}

	export function handleMouseMove(e: MouseEvent, width: number, height: number) {
		if (!(activeHandle || isDraggingCrop)) {
			return;
		}

		const rect = (e.target as HTMLElement).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const pos = screenToImage(offsetX, offsetY, width, height);
		const dx = pos.x - lastPointerPos.x;
		const dy = pos.y - lastPointerPos.y;

		const { crop } = storeState;
		if (!crop) {
			return;
		}

		if (isDraggingCrop) {
			crop.x += dx;
			crop.y += dy;
		} else if (activeHandle === 'tl') {
			crop.x += dx;
			crop.y += dy;
			crop.width -= dx;
			crop.height -= dy;
		} else if (activeHandle === 'tr') {
			crop.y += dy;
			crop.width += dx;
			crop.height -= dy;
		} else if (activeHandle === 'bl') {
			crop.x += dx;
			crop.width -= dx;
			crop.height += dy;
		} else if (activeHandle === 'br') {
			crop.width += dx;
			crop.height += dy;
		}

		lastPointerPos = pos;
	}

	export function handleMouseUp() {
		activeHandle = null;
		isDraggingCrop = false;
	}

	// Render function for the crop overlay
	const renderCropUI = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { crop, zoom, translateX, translateY, imageElement } = storeState;
		if (!(crop && imageElement)) {
			return;
		}

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;
		const cx = crop.x + offsetX;
		const cy = crop.y + offsetY;

		// 1. Draw Dimmed Overlay (using clip)
		context.save();
		context.beginPath();
		// Outer rect
		context.rect(offsetX, offsetY, imageElement.width, imageElement.height);
		// Inner cutout
		if (cropShape === 'circular') {
			context.arc(cx + crop.width / 2, cy + crop.height / 2, Math.min(crop.width, crop.height) / 2, 0, Math.PI * 2, true);
		} else {
			context.rect(cx + crop.width, cy, -crop.width, crop.height);
		}
		context.clip();
		context.fillStyle = 'rgba(0, 0, 0, 0.5)';
		context.fillRect(offsetX, offsetY, imageElement.width, imageElement.height);
		context.restore();

		// 2. Draw Crop Border
		context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
		context.lineWidth = 1 / zoom;
		if (cropShape === 'circular') {
			context.beginPath();
			context.arc(cx + crop.width / 2, cy + crop.height / 2, Math.min(crop.width, crop.height) / 2, 0, Math.PI * 2);
			context.stroke();
		} else {
			context.strokeRect(cx, cy, crop.width, crop.height);

			// 3. Draw Rule of Thirds Grid
			context.beginPath();
			context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
			for (let i = 1; i <= 2; i++) {
				context.moveTo(cx + (crop.width * i) / 3, cy);
				context.lineTo(cx + (crop.width * i) / 3, cy + crop.height);
				context.moveTo(cx, cy + (crop.height * i) / 3);
				context.lineTo(cx + crop.width, cy + (crop.height * i) / 3);
			}
			context.stroke();
		}

		// 4. Draw Handles (Corners)
		context.fillStyle = 'white';
		const hs = HANDLE_SIZE / zoom;
		const hRects = [
			[cx - hs / 2, cy - hs / 2],
			[cx + crop.width - hs / 2, cy - hs / 2],
			[cx - hs / 2, cy + crop.height - hs / 2],
			[cx + crop.width - hs / 2, cy + crop.height - hs / 2]
		];
		for (const [hx, hy] of hRects) {
			context.beginPath();
			context.arc(hx + hs / 2, hy + hs / 2, hs / 2, 0, Math.PI * 2);
			context.fill();
			context.strokeStyle = 'rgba(0,0,0,0.2)';
			context.stroke();
		}

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {}
</script>

<Layer render={renderCropUI} />
