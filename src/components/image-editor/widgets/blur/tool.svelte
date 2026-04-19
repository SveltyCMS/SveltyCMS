<!--
@file: src/components/image-editor/widgets/Blur/Tool.svelte
@component
Blur tool with interactive rectangular redaction regions.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import BlurControls from './controls.svelte';

	interface BlurRegion {
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
		rotation: number;
		flipped: boolean;
		strength: number;
	}

	let blurStrength = $state(20);
	let activeId = $state<string | null>(null);

	const storeState = imageEditorStore.state;

	// Ensure blurRegions is always an array
	const blurRegions = $derived(Array.isArray(storeState.blurRegions) ? storeState.blurRegions as BlurRegion[] : []);

	// Generate unique ID
	function generateId(): string {
		return `blur_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	// Add new blur region
	function handleAddRegion() {
		const img = storeState.imageElement;
		if (!img) return;

		const id = generateId();
		const newRegion: BlurRegion = {
			id,
			x: img.width * 0.2,
			y: img.height * 0.2,
			width: img.width * 0.4,
			height: img.height * 0.4,
			rotation: 0,
			flipped: false,
			strength: blurStrength
		};

		storeState.blurRegions = [...blurRegions, newRegion];
		activeId = id;
		imageEditorStore.takeSnapshot();
		updateToolbar();
	}

	// Delete selected region
	function handleDeleteRegion() {
		if (!activeId) return;
		storeState.blurRegions = blurRegions.filter((r) => r.id !== activeId);
		activeId = null;
		imageEditorStore.takeSnapshot();
		updateToolbar();
	}

	function handleReset() {
		storeState.blurRegions = [];
		activeId = null;
		imageEditorStore.takeSnapshot();
		updateToolbar();
	}

	function updateToolbar() {
		imageEditorStore.setToolbarControls({
			component: BlurControls,
			props: {
				blurStrength,
				hasActiveRegion: !!activeId,
				regionCount: blurRegions.length,
				onStrengthChange: (v: number) => {
					blurStrength = v;
					if (activeId) {
						storeState.blurRegions = blurRegions.map((r) =>
							r.id === activeId ? { ...r, strength: v } : r
						);
					}
				},
				onAddRegion: handleAddRegion,
				onDeleteRegion: handleDeleteRegion,
				onReset: handleReset,
				onCancel: () => imageEditorStore.cancelActiveTool(),
				onApply: () => imageEditorStore.setActiveState('')
			}
		});
	}

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'blur') {
			updateToolbar();
		} else if (imageEditorStore.state.toolbarControls?.component === BlurControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	// Mouse handlers for selecting/dragging regions
	let isDragging = $state(false);
	let isResizing = $state(false);
	let resizeHandle = $state<string | null>(null);
	let dragStart = { x: 0, y: 0, regionX: 0, regionY: 0 };

	function screenToImage(screenX: number, screenY: number, width: number, height: number) {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return { x: 0, y: 0 };

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		return {
			x: (screenX - centerX) / zoom + imageElement.width / 2,
			y: (screenY - centerY) / zoom + imageElement.height / 2
		};
	}

	export function handleMouseDown(e: MouseEvent, width: number, height: number) {
		const { zoom, imageElement } = storeState;
		if (!imageElement) return;

		const rect = ((e.currentTarget as HTMLElement) ?? (e.target as HTMLElement)).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const pos = screenToImage(offsetX, offsetY, width, height);

		// Check if clicking on a handle first
		if (activeId) {
			const active = blurRegions.find((r) => r.id === activeId);
			if (active) {
				const handles = [
					{ id: 'nw', x: active.x, y: active.y },
					{ id: 'ne', x: active.x + active.width, y: active.y },
					{ id: 'sw', x: active.x, y: active.y + active.height },
					{ id: 'se', x: active.x + active.width, y: active.y + active.height }
				];
				const hitHandle = handles.find(
					(h) => Math.abs(h.x - pos.x) < 10 / zoom && Math.abs(h.y - pos.y) < 10 / zoom
				);
				if (hitHandle) {
					isResizing = true;
					resizeHandle = hitHandle.id;
					dragStart = { x: pos.x, y: pos.y, regionX: active.x, regionY: active.y };
					return;
				}
			}
		}

		// Find clicked region
		for (const region of blurRegions) {
			if (pos.x >= region.x && pos.x <= region.x + region.width && pos.y >= region.y && pos.y <= region.y + region.height) {
				activeId = region.id;
				isDragging = true;
				dragStart = { x: pos.x, y: pos.y, regionX: region.x, regionY: region.y };
				updateToolbar();
				return;
			}
		}

		// Clicked outside - deselect
		activeId = null;
		updateToolbar();
	}

	export function handleMouseMove(e: MouseEvent, width: number, height: number) {
		if (!isDragging && !isResizing) return;
		const { imageElement } = storeState;
		if (!imageElement) return;

		const rect = ((e.currentTarget as HTMLElement) ?? (e.target as HTMLElement)).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const pos = screenToImage(offsetX, offsetY, width, height);

		if (isResizing && activeId) {
			const active = blurRegions.find((r) => r.id === activeId);
			if (active) {
				const dx = pos.x - dragStart.x;
				const dy = pos.y - dragStart.y;

				let newX = active.x;
				let newY = active.y;
				let newW = active.width;
				let newH = active.height;

				if (resizeHandle === 'se') {
					newW = Math.max(50, active.width + dx);
					newH = Math.max(50, active.height + dy);
				} else if (resizeHandle === 'nw') {
					newX = Math.min(dragStart.regionX + dx, dragStart.regionX + active.width - 50);
					newY = Math.min(dragStart.regionY + dy, dragStart.regionY + active.height - 50);
					newW = active.width - dx;
					newH = active.height - dy;
				} else if (resizeHandle === 'ne') {
					newY = Math.min(dragStart.regionY + dy, dragStart.regionY + active.height - 50);
					newW = active.width + dx;
					newH = active.height - dy;
				} else if (resizeHandle === 'sw') {
					newX = Math.min(dragStart.regionX + dx, dragStart.regionX + active.width - 50);
					newW = active.width - dx;
					newH = active.height + dy;
				}

				storeState.blurRegions = blurRegions.map((r) =>
					r.id === activeId ? { ...r, x: newX, y: newY, width: newW, height: newH } : r
				);
			}
		} else if (isDragging && activeId) {
			const dx = pos.x - dragStart.x;
			const dy = pos.y - dragStart.y;
			const active = blurRegions.find((r) => r.id === activeId);
			if (active) {
				const newX = Math.max(0, Math.min(imageElement.width - active.width, dragStart.regionX + dx));
				const newY = Math.max(0, Math.min(imageElement.height - active.height, dragStart.regionY + dy));
				storeState.blurRegions = blurRegions.map((r) =>
					r.id === activeId ? { ...r, x: newX, y: newY } : r
				);
			}
		}
	}

	export function handleMouseUp() {
		if (isDragging || isResizing) {
			imageEditorStore.takeSnapshot();
		}
		isDragging = false;
		isResizing = false;
		resizeHandle = null;
	}

	const renderBlurRegions = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return;

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;

		for (const region of blurRegions) {
			const rx = region.x + offsetX;
			const ry = region.y + offsetY;

			// Apply rotation around center
			if (region.rotation !== 0) {
				const cx = rx + region.width / 2;
				const cy = ry + region.height / 2;
				context.translate(cx, cy);
				context.rotate((region.rotation * Math.PI) / 180);
				if (region.flipped) {
					context.scale(-1, 1);
				}
				context.translate(-cx, -cy);
			}

			// Draw blur region indicator as a simple rectangular selection.
			context.fillStyle = 'rgba(59, 130, 246, 0.14)';
			context.strokeStyle = region.id === activeId ? '#3b82f6' : 'rgba(255, 255, 255, 0.55)';
			context.lineWidth = region.id === activeId ? 3 / zoom : 1.5 / zoom;
			context.fillRect(rx, ry, region.width, region.height);
			context.strokeRect(rx, ry, region.width, region.height);

			// Draw resize handles for active region
			if (region.id === activeId) {
				context.fillStyle = '#ffffff';
				context.strokeStyle = '#3b82f6';
				context.lineWidth = 2 / zoom;
				const handleSize = 8 / zoom;
				const handles = [
					[rx, ry],
					[rx + region.width, ry],
					[rx, ry + region.height],
					[rx + region.width, ry + region.height]
				];
				for (const [hx, hy] of handles) {
					context.beginPath();
					context.arc(hx, hy, handleSize / 2, 0, Math.PI * 2);
					context.fill();
					context.stroke();
				}
			}

			// Reset transform
			if (region.rotation !== 0 || region.flipped) {
				context.setTransform(1, 0, 0, 1, 0, 0);
				context.translate(width / 2 + translateX, height / 2 + translateY);
				context.scale(zoom, zoom);
			}
		}

		context.restore();
	};

	export function saveState() {
		return blurRegions;
	}

	export function beforeExit() {}
</script>

<Layer render={renderBlurRegions} />
