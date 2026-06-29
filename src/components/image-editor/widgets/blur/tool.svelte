<!--
@file: src/components/image-editor/widgets/Blur/Tool.svelte
@component
Blur tool with interactive rectangular redaction regions.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import BlurControls from './controls.svelte';
	import BlurControlsMobile from './controls-mobile.svelte';

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
	let showRegionChrome = $state(true);
	let canvasSize = { width: 0, height: 0 };

	const storeState = imageEditorStore.state;
	const MIN_REGION = 48;

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
		const bounds = getInteractionBounds(img);
		const padX = bounds.width * 0.06;
		const padY = bounds.height * 0.06;
		const inner = {
			x: bounds.x + padX,
			y: bounds.y + padY,
			width: Math.max(MIN_REGION, bounds.width - padX * 2),
			height: Math.max(MIN_REGION, bounds.height - padY * 2)
		};
		const width = Math.max(MIN_REGION, inner.width * (imageEditorStore.isMobile ? 0.62 : 0.4));
		const height = Math.max(MIN_REGION, inner.height * (imageEditorStore.isMobile ? 0.38 : 0.4));

		const newRegion: BlurRegion = {
			id,
			...clampRegion(
				{
					x: inner.x + (inner.width - width) / 2,
					y: inner.y + (inner.height - height) / 2,
					width,
					height
				},
				bounds,
				img
			),
			rotation: 0,
			flipped: false,
			strength: blurStrength
		};

		storeState.blurRegions = [...blurRegions, newRegion];
		activeId = id;
		showRegionChrome = true;
		imageEditorStore.takeSnapshot();
		refreshToolbar();
	}

	// Delete selected region
	function handleDeleteRegion() {
		if (!activeId) return;
		storeState.blurRegions = blurRegions.filter((r) => r.id !== activeId);
		activeId = null;
		imageEditorStore.takeSnapshot();
		refreshToolbar();
	}

	function handleReset() {
		storeState.blurRegions = [];
		activeId = null;
		imageEditorStore.takeSnapshot();
		refreshToolbar();
	}

	function refreshToolbar() {
		updateToolbar(
			imageEditorStore.state.viewportWidth < imageEditorStore.mobileBreakpoint,
			blurStrength,
			!!activeId,
			blurRegions.length
		);
	}

	function updateToolbar(
		isMobile: boolean,
		strength: number,
		hasActiveRegion: boolean,
		regionCount: number
	) {
		const ControlsComponent = isMobile ? BlurControlsMobile : BlurControls;

		const strengthHandler = (v: number) => {
			blurStrength = v;
			if (activeId) {
				storeState.blurRegions = blurRegions.map((r) =>
					r.id === activeId ? { ...r, strength: v } : r
				);
			}
		};

		const actionHandlers = {
			onAddRegion: handleAddRegion,
			onDeleteRegion: handleDeleteRegion,
			onReset: handleReset,
			onApply: handleApplyBlur,
			onCancel: handleCancelBlur
		};

		imageEditorStore.setToolbarControls({
			component: ControlsComponent,
			props: {
				blurStrength: strength,
				hasActiveRegion,
				regionCount,
				onStrengthChange: strengthHandler,
				...actionHandlers
			}
		});
	}

	function restoreBlurRegionsFromPreToolSnapshot() {
		const snapshotStr = imageEditorStore.state.preToolSnapshot;
		if (!snapshotStr) {
			storeState.blurRegions = [];
			return;
		}

		try {
			const snapshot = JSON.parse(snapshotStr);
			storeState.blurRegions = Array.isArray(snapshot.blurRegions) ? snapshot.blurRegions : [];
		} catch {
			storeState.blurRegions = [];
		}
	}

	function handleApplyBlur() {
		activeId = null;
		showRegionChrome = false;
		imageEditorStore.takeSnapshot();
		imageEditorStore.state.preToolSnapshot = imageEditorStore.undoState(true);
		refreshToolbar();
	}

	function handleCancelBlur() {
		restoreBlurRegionsFromPreToolSnapshot();
		activeId = null;
		showRegionChrome = true;
		refreshToolbar();
	}

	function isBlurToolbarComponent(component: unknown): boolean {
		return component === BlurControls || component === BlurControlsMobile;
	}

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		const viewportWidth = imageEditorStore.state.viewportWidth;
		const isMobile = viewportWidth < imageEditorStore.mobileBreakpoint;
		const strength = blurStrength;
		const hasActive = !!activeId;
		const count = blurRegions.length;

		if (activeState === 'blur') {
			updateToolbar(isMobile, strength, hasActive, count);
		} else {
			activeId = null;
			showRegionChrome = true;
			if (!activeState && isBlurToolbarComponent(imageEditorStore.state.toolbarControls?.component)) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// Mouse handlers for selecting/dragging regions
	let isDragging = $state(false);
	let isResizing = $state(false);
	let resizeHandle = $state<string | null>(null);
	let dragStart = { x: 0, y: 0, regionX: 0, regionY: 0 };

	function getImageBounds(img: HTMLImageElement) {
		return { x: 0, y: 0, width: img.width, height: img.height };
	}

	/** Visible portion of the image mapped from the current canvas viewport */
	function getVisibleImageBounds(canvasW: number, canvasH: number, img: HTMLImageElement) {
		if (canvasW <= 0 || canvasH <= 0) {
			return getImageBounds(img);
		}

		const corners = [
			screenToImage(0, 0, canvasW, canvasH),
			screenToImage(canvasW, 0, canvasW, canvasH),
			screenToImage(0, canvasH, canvasW, canvasH),
			screenToImage(canvasW, canvasH, canvasW, canvasH)
		];

		const minX = Math.max(0, Math.min(...corners.map((c) => c.x)));
		const minY = Math.max(0, Math.min(...corners.map((c) => c.y)));
		const maxX = Math.min(img.width, Math.max(...corners.map((c) => c.x)));
		const maxY = Math.min(img.height, Math.max(...corners.map((c) => c.y)));

		return {
			x: minX,
			y: minY,
			width: Math.max(MIN_REGION, maxX - minX),
			height: Math.max(MIN_REGION, maxY - minY)
		};
	}

	function getInteractionBounds(img: HTMLImageElement) {
		if (imageEditorStore.isMobile && canvasSize.width > 0 && canvasSize.height > 0) {
			return getVisibleImageBounds(canvasSize.width, canvasSize.height, img);
		}
		return getImageBounds(img);
	}

	function minRegionSize(bounds: { width: number; height: number }) {
		return Math.max(24, Math.min(MIN_REGION, bounds.width * 0.2, bounds.height * 0.2));
	}

	function clampRegion(
		rect: { x: number; y: number; width: number; height: number },
		bounds: { x: number; y: number; width: number; height: number },
		img: HTMLImageElement
	) {
		const imageBounds = getImageBounds(img);
		const minSize = minRegionSize(bounds);

		let width = Math.max(minSize, Math.min(rect.width, bounds.width, imageBounds.width));
		let height = Math.max(minSize, Math.min(rect.height, bounds.height, imageBounds.height));

		let x = Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.width - width));
		let y = Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.height - height));

		x = Math.max(0, Math.min(x, img.width - width));
		y = Math.max(0, Math.min(y, img.height - height));

		return { x, y, width, height };
	}

	function applyRegionUpdate(
		regionId: string,
		next: { x: number; y: number; width: number; height: number }
	) {
		const img = storeState.imageElement;
		if (!img) return;

		const bounds = getInteractionBounds(img);
		const clamped = clampRegion(next, bounds, img);

		storeState.blurRegions = blurRegions.map((r) => (r.id === regionId ? { ...r, ...clamped } : r));
	}

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

	function resolveScreenPoint(
		e: MouseEvent,
		width: number,
		height: number,
		canvasX: number | undefined = undefined,
		canvasY: number | undefined = undefined
	) {
		if (canvasX !== undefined && canvasY !== undefined) {
			return { x: canvasX, y: canvasY };
		}
		const target = e.currentTarget as HTMLElement | null;
		if (target?.getBoundingClientRect) {
			const rect = target.getBoundingClientRect();
			return { x: e.clientX - rect.left, y: e.clientY - rect.top };
		}
		return { x: e.offsetX, y: e.offsetY };
	}

	function handleHitRadius() {
		const { zoom } = storeState;
		const screenPx = imageEditorStore.isMobile ? 28 : 10;
		return screenPx / zoom;
	}

	export function handleMouseDown(
		e: MouseEvent,
		width: number,
		height: number,
		canvasX: number | undefined = undefined,
		canvasY: number | undefined = undefined
	) {
		const { imageElement } = storeState;
		if (!imageElement) return;

		const screen = resolveScreenPoint(e, width, height, canvasX, canvasY);
		const pos = screenToImage(screen.x, screen.y, width, height);
		const hitRadius = handleHitRadius();

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
					(h) => Math.abs(h.x - pos.x) < hitRadius && Math.abs(h.y - pos.y) < hitRadius
				);
				if (hitHandle) {
					showRegionChrome = true;
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
				showRegionChrome = true;
				isDragging = true;
				dragStart = { x: pos.x, y: pos.y, regionX: region.x, regionY: region.y };
				refreshToolbar();
				return;
			}
		}

		// Clicked outside - deselect
		activeId = null;
		refreshToolbar();
	}

	export function handleMouseMove(
		e: MouseEvent,
		width: number,
		height: number,
		canvasX: number | undefined = undefined,
		canvasY: number | undefined = undefined
	) {
		if (!isDragging && !isResizing) return;
		const { imageElement } = storeState;
		if (!imageElement) return;

		const screen = resolveScreenPoint(e, width, height, canvasX, canvasY);
		const pos = screenToImage(screen.x, screen.y, width, height);

		if (isResizing && activeId) {
			const active = blurRegions.find((r) => r.id === activeId);
			if (active) {
				const dx = pos.x - dragStart.x;
				const dy = pos.y - dragStart.y;
				const minSize = minRegionSize(getInteractionBounds(imageElement));

				let newX = active.x;
				let newY = active.y;
				let newW = active.width;
				let newH = active.height;

				if (resizeHandle === 'se') {
					newW = Math.max(minSize, active.width + dx);
					newH = Math.max(minSize, active.height + dy);
				} else if (resizeHandle === 'nw') {
					newX = Math.min(dragStart.regionX + dx, dragStart.regionX + active.width - minSize);
					newY = Math.min(dragStart.regionY + dy, dragStart.regionY + active.height - minSize);
					newW = active.width - dx;
					newH = active.height - dy;
				} else if (resizeHandle === 'ne') {
					newY = Math.min(dragStart.regionY + dy, dragStart.regionY + active.height - minSize);
					newW = active.width + dx;
					newH = active.height - dy;
				} else if (resizeHandle === 'sw') {
					newX = Math.min(dragStart.regionX + dx, dragStart.regionX + active.width - minSize);
					newW = active.width - dx;
					newH = active.height + dy;
				}

				applyRegionUpdate(activeId, { x: newX, y: newY, width: newW, height: newH });
			}
		} else if (isDragging && activeId) {
			const dx = pos.x - dragStart.x;
			const dy = pos.y - dragStart.y;
			const active = blurRegions.find((r) => r.id === activeId);
			if (active) {
				applyRegionUpdate(activeId, {
					x: dragStart.regionX + dx,
					y: dragStart.regionY + dy,
					width: active.width,
					height: active.height
				});
			}
		}
	}

	export function handleMouseUp() {
		if ((isDragging || isResizing) && activeId && storeState.imageElement) {
			const active = blurRegions.find((r) => r.id === activeId);
			if (active) {
				applyRegionUpdate(activeId, active);
			}
			imageEditorStore.takeSnapshot();
		}
		isDragging = false;
		isResizing = false;
		resizeHandle = null;
	}

	const renderBlurRegions = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		canvasSize = { width, height };

		if (imageEditorStore.state.activeState !== 'blur' || blurRegions.length === 0 || !showRegionChrome) {
			return;
		}

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
				const handleSize = (imageEditorStore.isMobile ? 14 : 8) / zoom;
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
