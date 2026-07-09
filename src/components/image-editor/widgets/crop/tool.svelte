<!--
@file: src/components/image-editor/widgets/crop/tool.svelte
@component
**Crop Tool "Controller"**

Viewport-fixed crop frame: drag inside pans the image behind the frame;
handles resize the frame in screen space. Image-space crop syncs on release.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import CropControls from './controls.svelte';
	import CropControlsMobile from './controls-mobile.svelte';
	import type { CropShape } from './types';

	let cropShape = $state<CropShape>('rectangle');

	const storeState = imageEditorStore.state;

	type ViewportRect = { x: number; y: number; width: number; height: number };

	let cropViewport = $state<ViewportRect>({ x: 0, y: 0, width: 0, height: 0 });
	let viewportReady = $state(false);
	let canvasSize = { width: 0, height: 0 };
	let lastCropActive = false;
	let lastLayoutKey = '';

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		const viewportWidth = imageEditorStore.state.viewportWidth;
		const shape = cropShape;

		if (activeState === 'crop') {
			if (!lastCropActive) {
				viewportReady = false;
				lastLayoutKey = '';
			}
			lastCropActive = true;
			updateToolbar(viewportWidth < imageEditorStore.mobileBreakpoint, shape);
		} else {
			lastCropActive = false;
			if (!activeState && isCropToolbarComponent(imageEditorStore.state.toolbarControls?.component)) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	function isCropToolbarComponent(component: unknown): boolean {
		return component === CropControls || component === CropControlsMobile;
	}

	function refreshToolbar() {
		updateToolbar(
			imageEditorStore.state.viewportWidth < imageEditorStore.mobileBreakpoint,
			cropShape
		);
	}

	function updateToolbar(isMobile: boolean, shape: CropShape) {
		const ControlsComponent = isMobile ? CropControlsMobile : CropControls;

		const shapeHandlers = {
			cropShape: shape,
			onCropShapeChange: (s: CropShape) => {
				cropShape = s;
				if (s === 'rectangle') {
					// Free-form rectangle: release the aspect lock so handles resize freely,
					// and reshape the frame to the image's proportions so the switch is visible
					// (otherwise a square frame stays square until the user drags a handle)
					storeState.currentAspectRatio = null;
					const img = storeState.imageElement;
					if (img && img.height > 0 && img.width !== img.height) {
						resizeViewportToRatio(img.width / img.height, s);
					} else {
						clampViewport();
						syncImageCropFromViewport();
						refreshToolbar();
					}
					return;
				}
				// Square/circle must stay 1:1 while dragging handles, not just on selection
				storeState.currentAspectRatio = 1;
				resizeViewportToRatio(1, s);
			},
			onAspectRatio: (r: number | null) => {
				storeState.currentAspectRatio = r === 0 ? null : r;
				if (r === null || r === 0) {
					cropShape = 'rectangle';
					clampViewport();
					syncImageCropFromViewport();
					return;
				}

				if (r === 1) {
					cropShape = cropShape === 'circular' ? 'circular' : 'square';
				} else {
					cropShape = 'rectangle';
				}

				resizeViewportToRatio(r, cropShape);
			}
		};

		imageEditorStore.setToolbarControls({
			component: ControlsComponent,
			props: isMobile
				? shapeHandlers
				: {
						...shapeHandlers,
						crop: storeState.crop ?? {
							x: 0,
							y: 0,
							width: storeState.imageElement?.width ?? 0,
							height: storeState.imageElement?.height ?? 0
						},
						onCropChange: (nextCrop: { x: number; y: number; width: number; height: number }) => {
							storeState.crop = {
								x: Math.max(0, Math.round(nextCrop.x)),
								y: Math.max(0, Math.round(nextCrop.y)),
								width: Math.max(MIN_IMAGE_CROP, Math.round(nextCrop.width)),
								height: Math.max(MIN_IMAGE_CROP, Math.round(nextCrop.height))
							};
							normalizeImageCrop();
							if (canvasSize.width > 0) {
								viewportFromImageCrop(canvasSize.width, canvasSize.height);
							}
							imageEditorStore.takeSnapshot();
						}
					}
		});
	}

	// Interactive state
	let activeHandle = $state<string | null>(null);
	let isPanningImage = $state(false);
	let lastScreenPos = { x: 0, y: 0 };

	const MIN_VIEWPORT = 48;
	const MIN_IMAGE_CROP = 20;
	const CROP_EDGE_PAD = 14;

	function handleHitRadius() {
		return imageEditorStore.isMobile ? 26 : 14;
	}

	function getCropBounds(width: number, height: number) {
		const pad = CROP_EDGE_PAD + (imageEditorStore.isMobile ? 10 : 5);
		return {
			x: pad,
			y: pad,
			width: Math.max(MIN_VIEWPORT, width - pad * 2),
			height: Math.max(MIN_VIEWPORT, height - pad * 2)
		};
	}

	/** Axis-aligned screen bounds of the transformed image */
	function getImageScreenRect(width: number, height: number): ViewportRect | null {
		const { zoom, translateX, translateY, imageElement, rotation, flipH, flipV } = storeState;
		if (!imageElement) {
			return null;
		}

		const halfW = imageElement.width / 2;
		const halfH = imageElement.height / 2;
		const rad = (rotation * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		const scaleX = flipH ? -zoom : zoom;
		const scaleY = flipV ? -zoom : zoom;
		const originX = width / 2 + translateX;
		const originY = height / 2 + translateY;

		const corners = [
			[-halfW, -halfH],
			[halfW, -halfH],
			[-halfW, halfH],
			[halfW, halfH]
		].map(([localX, localY]) => {
			const scaledX = localX * scaleX;
			const scaledY = localY * scaleY;
			return {
				x: originX + scaledX * cos - scaledY * sin,
				y: originY + scaledX * sin + scaledY * cos
			};
		});

		const xs = corners.map((point) => point.x);
		const ys = corners.map((point) => point.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);

		return {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY
		};
	}

	function ensureZoomFitsCanvas(width: number, height: number) {
		const { imageElement } = storeState;
		if (!imageElement || width <= 0 || height <= 0) {
			return;
		}

		const imageRect = getImageScreenRect(width, height);
		const bounds = getCropBounds(width, height);
		if (!imageRect) {
			return;
		}

		if (imageRect.width <= bounds.width * 1.02 && imageRect.height <= bounds.height * 1.02) {
			return;
		}

		const isMobile = imageEditorStore.isMobile;
		const widthFitRatio = isMobile ? 0.84 : 0.82;
		const heightFitRatio = isMobile ? 0.62 : 0.82;
		const fitScale = Math.min(
			(width * widthFitRatio) / imageElement.width,
			(height * heightFitRatio) / imageElement.height
		);

		storeState.zoom = Math.min(5, Math.max(0.1, fitScale));
		storeState.translateX = 0;
		storeState.translateY = 0;
	}

	function resolveChromeCanvasBg(): string {
		if (typeof document === 'undefined') return '#1a1a1a';
		const panel = document.querySelector('.image-editor-panel');
		if (!panel) return '#1a1a1a';
		const styles = getComputedStyle(panel);
		return (
			styles.getPropertyValue('--editor-canvas-bg').trim() ||
			styles.getPropertyValue('--editor-chrome-bg').trim() ||
			'#1a1a1a'
		);
	}

	function viewportFromImageCrop(width: number, height: number) {
		const { crop, zoom, translateX, translateY, imageElement } = storeState;
		if (!(crop && imageElement)) {
			return;
		}

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;
		const halfW = imageElement.width / 2;
		const halfH = imageElement.height / 2;

		cropViewport = {
			x: centerX + (crop.x - halfW) * zoom,
			y: centerY + (crop.y - halfH) * zoom,
			width: crop.width * zoom,
			height: crop.height * zoom
		};
		clampViewport();
	}

	function syncImageCropFromViewport() {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement || cropViewport.width <= 0) {
			return;
		}

		const { width, height } = canvasSize.width > 0 ? canvasSize : { width: 0, height: 0 };
		if (width <= 0) {
			return;
		}

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;
		const halfW = imageElement.width / 2;
		const halfH = imageElement.height / 2;

		storeState.crop = {
			x: Math.round((cropViewport.x - centerX) / zoom + halfW),
			y: Math.round((cropViewport.y - centerY) / zoom + halfH),
			width: Math.round(cropViewport.width / zoom),
			height: Math.round(cropViewport.height / zoom),
			shape: cropShape === 'circular' ? 'circle' : 'rect'
		};
		normalizeImageCrop();
	}

	function normalizeImageCrop() {
		const { crop, imageElement } = storeState;
		if (!(crop && imageElement)) {
			return;
		}

		let x = Number.isFinite(crop.x) ? crop.x : 0;
		let y = Number.isFinite(crop.y) ? crop.y : 0;
		let width = Number.isFinite(crop.width) ? crop.width : imageElement.width;
		let height = Number.isFinite(crop.height) ? crop.height : imageElement.height;

		if (width < 0) {
			x += width;
			width = Math.abs(width);
		}
		if (height < 0) {
			y += height;
			height = Math.abs(height);
		}

		width = Math.max(MIN_IMAGE_CROP, width);
		height = Math.max(MIN_IMAGE_CROP, height);

		if (x < 0) {
			width += x;
			x = 0;
		}
		if (y < 0) {
			height += y;
			y = 0;
		}
		if (x + width > imageElement.width) {
			width = imageElement.width - x;
		}
		if (y + height > imageElement.height) {
			height = imageElement.height - y;
		}

		width = Math.max(MIN_IMAGE_CROP, Math.min(width, imageElement.width));
		height = Math.max(MIN_IMAGE_CROP, Math.min(height, imageElement.height));

		storeState.crop = {
			x: Math.round(x),
			y: Math.round(y),
			width: Math.round(width),
			height: Math.round(height)
		};
	}

	function clampViewport() {
		const { width, height } = canvasSize;
		if (width <= 0 || height <= 0) {
			return;
		}

		const bounds = getCropBounds(width, height);
		const imageRect = getImageScreenRect(width, height);
		let { x, y, width: vw, height: vh } = cropViewport;

		if (imageRect && imageRect.width > 0 && imageRect.height > 0) {
			if (vw > imageRect.width || vh > imageRect.height) {
				const scale = Math.min(imageRect.width / vw, imageRect.height / vh, 1);
				vw *= scale;
				vh *= scale;
			}

			vw = Math.max(MIN_VIEWPORT, Math.min(vw, imageRect.width));
			vh = Math.max(MIN_VIEWPORT, Math.min(vh, imageRect.height));
			x = Math.max(imageRect.x, Math.min(x, imageRect.x + imageRect.width - vw));
			y = Math.max(imageRect.y, Math.min(y, imageRect.y + imageRect.height - vh));
		}

		const imageFitsSafeArea =
			imageRect &&
			imageRect.x >= bounds.x - 1 &&
			imageRect.y >= bounds.y - 1 &&
			imageRect.x + imageRect.width <= bounds.x + bounds.width + 1 &&
			imageRect.y + imageRect.height <= bounds.y + bounds.height + 1;

		if (imageFitsSafeArea) {
			if (vw > bounds.width || vh > bounds.height) {
				const scale = Math.min(bounds.width / vw, bounds.height / vh, 1);
				vw *= scale;
				vh *= scale;
			}

			vw = Math.max(MIN_VIEWPORT, Math.min(vw, bounds.width));
			vh = Math.max(MIN_VIEWPORT, Math.min(vh, bounds.height));
			x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - vw));
			y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - vh));
		}

		const next = { x, y, width: vw, height: vh };
		if (
			cropViewport.x === next.x &&
			cropViewport.y === next.y &&
			cropViewport.width === next.width &&
			cropViewport.height === next.height
		) {
			return;
		}

		cropViewport = next;
	}

	function initDefaultCropViewport(width: number, height: number) {
		const { imageElement, currentAspectRatio } = storeState;
		if (!imageElement) {
			return;
		}

		ensureZoomFitsCanvas(width, height);

		storeState.crop = {
			x: 0,
			y: 0,
			width: imageElement.width,
			height: imageElement.height
		};

		viewportFromImageCrop(width, height);

		if (currentAspectRatio && currentAspectRatio > 0) {
			resizeViewportToRatio(currentAspectRatio, cropShape);
		}
	}

	function initViewportIfNeeded(width: number, height: number) {
		canvasSize = { width, height };
		const layoutKey = `${width}x${height}:${imageEditorStore.isMobile ? 'm' : 'd'}`;

		if (!storeState.imageElement) {
			return;
		}

		if (viewportReady && cropViewport.width > 0) {
			if (layoutKey !== lastLayoutKey && storeState.crop?.width) {
				lastLayoutKey = layoutKey;
				ensureZoomFitsCanvas(width, height);
				viewportFromImageCrop(width, height);
			}
			return;
		}

		lastLayoutKey = layoutKey;
		ensureZoomFitsCanvas(width, height);

		if (storeState.crop && storeState.crop.width > 0 && storeState.crop.height > 0) {
			viewportFromImageCrop(width, height);
		} else {
			initDefaultCropViewport(width, height);
		}

		viewportReady = true;
		refreshToolbar();
	}

	function resizeViewportToRatio(ratio: number, shape: CropShape) {
		if (cropViewport.width <= 0) {
			return;
		}

		const cx = cropViewport.x + cropViewport.width / 2;
		const cy = cropViewport.y + cropViewport.height / 2;
		const targetRatio = ratio > 0 ? ratio : 1;

		// Preserve the frame's area when reshaping — shrinking one side only would
		// ratchet the frame smaller on every rectangle/square/circle switch.
		// clampViewport() below scales it back down if it exceeds the image bounds.
		const area = cropViewport.width * cropViewport.height;
		let width = Math.sqrt(area * targetRatio);
		let height = width / targetRatio;

		width = Math.max(MIN_VIEWPORT, width);
		height = Math.max(MIN_VIEWPORT, height);

		cropViewport = {
			x: cx - width / 2,
			y: cy - height / 2,
			width,
			height
		};
		clampViewport();
		syncImageCropFromViewport();
		cropShape = shape;
		refreshToolbar();
	}

	function applyAspectDuringResize(next: ViewportRect, handle: string): ViewportRect {
		const ratio = storeState.currentAspectRatio;
		if (!ratio || ratio <= 0) {
			return next;
		}

		let width = next.width;
		let height = next.height;

		if (width / height > ratio) {
			height = width / ratio;
		} else {
			width = height * ratio;
		}

		width = Math.max(MIN_VIEWPORT, width);
		height = Math.max(MIN_VIEWPORT, height);

		if (handle === 'br') {
			return { x: next.x, y: next.y, width, height };
		}
		if (handle === 'tl') {
			const brX = next.x + next.width;
			const brY = next.y + next.height;
			return { x: brX - width, y: brY - height, width, height };
		}
		if (handle === 'tr') {
			return { x: next.x, y: next.y + next.height - height, width, height };
		}
		if (handle === 'bl') {
			return { x: next.x + next.width - width, y: next.y, width, height };
		}

		return next;
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

	function hitTestHandle(screenX: number, screenY: number) {
		const { x, y, width, height } = cropViewport;
		const handles = [
			{ id: 'tl', hx: x, hy: y },
			{ id: 'tr', hx: x + width, hy: y },
			{ id: 'bl', hx: x, hy: y + height },
			{ id: 'br', hx: x + width, hy: y + height }
		];

		return handles.find(
			(h) =>
				Math.abs(h.hx - screenX) <= handleHitRadius() && Math.abs(h.hy - screenY) <= handleHitRadius()
		);
	}

	function isInsideViewport(screenX: number, screenY: number) {
		const { x, y, width, height } = cropViewport;
		return screenX > x && screenX < x + width && screenY > y && screenY < y + height;
	}

	export function handleMouseDown(
		e: MouseEvent,
		width: number,
		height: number,
		canvasX: number | undefined = undefined,
		canvasY: number | undefined = undefined
	) {
		if (!storeState.imageElement) {
			return;
		}

		initViewportIfNeeded(width, height);
		const pt = resolveScreenPoint(e, width, height, canvasX, canvasY);

		const hit = hitTestHandle(pt.x, pt.y);
		if (hit) {
			activeHandle = hit.id;
		} else if (isInsideViewport(pt.x, pt.y)) {
			isPanningImage = true;
		}

		lastScreenPos = { x: pt.x, y: pt.y };
	}

	export function handleMouseMove(
		e: MouseEvent,
		width: number,
		height: number,
		canvasX: number | undefined = undefined,
		canvasY: number | undefined = undefined
	) {
		if (!(activeHandle || isPanningImage)) {
			return;
		}

		const pt = resolveScreenPoint(e, width, height, canvasX, canvasY);
		const dx = pt.x - lastScreenPos.x;
		const dy = pt.y - lastScreenPos.y;

		if (isPanningImage) {
			storeState.translateX += dx;
			storeState.translateY += dy;
		} else if (activeHandle) {
			let next = { ...cropViewport };

			if (activeHandle === 'tl') {
				next = { x: next.x + dx, y: next.y + dy, width: next.width - dx, height: next.height - dy };
			} else if (activeHandle === 'tr') {
				next = { x: next.x, y: next.y + dy, width: next.width + dx, height: next.height - dy };
			} else if (activeHandle === 'bl') {
				next = { x: next.x + dx, y: next.y, width: next.width - dx, height: next.height + dy };
			} else if (activeHandle === 'br') {
				next = { x: next.x, y: next.y, width: next.width + dx, height: next.height + dy };
			}

			if (next.width < 0) {
				next.x += next.width;
				next.width = Math.abs(next.width);
			}
			if (next.height < 0) {
				next.y += next.height;
				next.height = Math.abs(next.height);
			}

			next = applyAspectDuringResize(next, activeHandle);
			cropViewport = next;
			clampViewport();
		}

		lastScreenPos = { x: pt.x, y: pt.y };
	}

	export function handleMouseUp() {
		if (activeHandle || isPanningImage) {
			syncImageCropFromViewport();
			imageEditorStore.takeSnapshot();
			refreshToolbar();
		}
		activeHandle = null;
		isPanningImage = false;
	}

	const renderCropUI = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		if (imageEditorStore.state.activeState !== 'crop' || !storeState.imageElement) {
			return;
		}

		initViewportIfNeeded(width, height);
		if (cropViewport.width <= 0) {
			return;
		}

		const { x, y, width: vw, height: vh } = cropViewport;
		const isMobileCrop = imageEditorStore.isMobile;

		// Dim outside the fixed viewport frame
		context.save();
		context.beginPath();
		context.rect(0, 0, width, height);
		if (cropShape === 'circular') {
			const radius = Math.min(vw, vh) / 2;
			context.arc(x + vw / 2, y + vh / 2, radius, 0, Math.PI * 2, true);
		} else {
			context.rect(x, y, vw, vh);
		}
		context.fillStyle = isMobileCrop ? resolveChromeCanvasBg() : 'rgba(0, 0, 0, 0.52)';
		context.fill('evenodd');
		context.restore();

		// Border and corner handles in screen space
		context.save();
		context.strokeStyle = '#ffffff';
		context.lineWidth = isMobileCrop ? 1 : 1.5;

		if (cropShape === 'circular') {
			const radius = Math.min(vw, vh) / 2;
			context.beginPath();
			context.arc(x + vw / 2, y + vh / 2, radius, 0, Math.PI * 2);
			context.stroke();
		} else {
			context.strokeRect(x, y, vw, vh);

			if (!isMobileCrop) {
				context.beginPath();
				context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
				context.lineWidth = 1;
				for (let i = 1; i <= 2; i++) {
					context.moveTo(x + (vw * i) / 3, y);
					context.lineTo(x + (vw * i) / 3, y + vh);
					context.moveTo(x, y + (vh * i) / 3);
					context.lineTo(x + vw, y + (vh * i) / 3);
				}
				context.stroke();
			}
		}

		const handleRadius = isMobileCrop ? 10 : 5;
		const handles = [
			[x, y],
			[x + vw, y],
			[x, y + vh],
			[x + vw, y + vh]
		];
		context.fillStyle = '#fff';
		for (const [hx, hy] of handles) {
			context.beginPath();
			context.arc(hx, hy, handleRadius, 0, Math.PI * 2);
			context.fill();
			if (!isMobileCrop) {
				context.strokeStyle = 'rgba(0, 0, 0, 0.25)';
				context.lineWidth = 1;
				context.stroke();
			}
		}

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {
		syncImageCropFromViewport();
		activeHandle = null;
		isPanningImage = false;
	}
</script>

<Layer render={renderCropUI} />
