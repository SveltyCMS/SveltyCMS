<!-- 
@file src/routes/(app)/imageEditor/components/Blur.svelte
@component
**Blur effect component using Konva canvas used for image editing**
Handles multiple blur region selections with floating action toolbars.
Professional UX inspired by Picsart: multiple regions, copy/delete, rotation at bottom.

### Props
- `blurStrength`: Current blur strength (bindable)
- `onBlurReset`: Function called when blur is reset
- `onBlurApplied`: Function called when blur is applied

### Exports
- `blurStrength`: Current blur strength (bindable)
- `updateBlurStrength()`: Update blur strength
- `reset()`: Reset blur effect
- `apply()`: Apply blur and exit
-->

<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import BlurControls from './Controls.svelte';

	let {
		blurStrength = $bindable(10),
		onBlurReset = () => {},
		onBlurApplied = () => {}
	} = $props<{
		blurStrength?: number;
		onBlurReset?: () => void;
		onBlurApplied?: () => void;
	}>();

	const { stage, layer, imageNode } = imageEditorStore.state;

	// Support multiple blur regions
	let blurRegions: Array<{
		rect: Konva.Rect;
		transformer: Konva.Transformer;
		overlay: Konva.Image | null;
		actionToolbar: Konva.Group;
	}> = [];

	let activeRegionIndex = $state<number | null>(null);
	let isSelecting = $state(false);
	let startPoint = $state<{ x: number; y: number } | null>(null);
	let mounted = false;

	function initBlurTool() {
		if (!stage) return;
		stage.on('mousedown touchstart', handleMouseDown);
		stage.on('mousemove touchmove', handleMouseMove);
		stage.on('mouseup touchend', handleMouseUp);
		stage.on('click tap', handleStageClick);
		stage.container().style.cursor = 'crosshair';
	}

	function deactivateBlurTool() {
		if (!stage) return;

		try {
			stage.off('mousedown touchstart', handleMouseDown);
			stage.off('mousemove touchmove', handleMouseMove);
			stage.off('mouseup touchend', handleMouseUp);
			stage.off('click tap', handleStageClick);

			if (stage.container()) {
				stage.container().style.cursor = 'default';
			}

			cleanupBlurElements();
		} catch (e) {
			console.warn('Error deactivating blur tool:', e);
			// Ensure cleanup happens even if there's an error
			if (blurRegions && Array.isArray(blurRegions)) {
				blurRegions = [];
			}
		}
	}

	$effect(() => {
		if (!stage || !layer || !imageNode) return;
		if (!mounted) {
			mounted = true;
			return () => {
				deactivateBlurTool();
			};
		}
	});

	// Effect to react to active tool state and register controls
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'blur') {
			initBlurTool();
			imageEditorStore.setToolbarControls({
				component: BlurControls,
				props: {
					blurStrength,
					onBlurStrengthChange: (v: number) => updateBlurStrength(v),
					onAddRegion: () => addNewBlurRegion(),
					onReset: () => reset(),
					onApply: () => apply()
				}
			});
		} else {
			deactivateBlurTool();
			// Only clear if Blur currently owns the toolbar
			if (imageEditorStore.state.toolbarControls?.component === BlurControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	function handleStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
		// Check if clicked on empty area (deselect all)
		if (e.target === stage) {
			deselectAllRegions();
		}
	}

	function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
		// Don't create new region if clicking on existing region or transformer
		if (e.target !== stage) return;
		if (!stage || !layer) return;

		isSelecting = true;
		const pos = stage.getPointerPosition();
		startPoint = pos ? { x: pos.x, y: pos.y } : null;
	}

	function handleMouseMove() {
		if (!isSelecting || !startPoint || !stage || !layer) return;

		const pos = stage.getPointerPosition();
		if (!pos) return;

		const width = pos.x - startPoint.x;
		const height = pos.y - startPoint.y;

		// Only create region if dragging with significant size
		if (Math.abs(width) < 5 || Math.abs(height) < 5) return;

		// Create temporary region while dragging
		if (activeRegionIndex === null || !blurRegions[activeRegionIndex]) {
			createBlurRegion(startPoint.x, startPoint.y, width, height);
		} else {
			// Update size while dragging
			const region = blurRegions[activeRegionIndex!];
			region.rect.width(Math.abs(width));
			region.rect.height(Math.abs(height));
			if (width < 0) region.rect.x(startPoint.x + width);
			if (height < 0) region.rect.y(startPoint.y + height);
			layer.batchDraw();
		}
	}

	function handleMouseUp() {
		if (!isSelecting || !layer) return;
		isSelecting = false;

		if (activeRegionIndex !== null && blurRegions[activeRegionIndex]) {
			const region = blurRegions[activeRegionIndex];

			// Normalize region dimensions
			const width = Math.abs(region.rect.width());
			const height = Math.abs(region.rect.height());

			if (width < 30 || height < 30) {
				// Too small, remove it
				deleteRegion(activeRegionIndex);
				activeRegionIndex = null;
			} else {
				region.rect.width(width);
				region.rect.height(height);
				setupTransformer(activeRegionIndex);
				applyBlurToRegion(activeRegionIndex);
			}
		}

		startPoint = null;
		layer.batchDraw();
	}

	function createBlurRegion(x: number, y: number, width: number, height: number) {
		if (!layer) return;

		const rect = new Konva.Rect({
			x,
			y,
			width: Math.abs(width),
			height: Math.abs(height),
			stroke: 'white',
			strokeWidth: 2,
			dash: [5, 5],
			draggable: true,
			name: 'blurRegion'
		});

		layer.add(rect);

		const regionIndex = blurRegions.length;
		blurRegions.push({
			rect,
			transformer: null as any,
			overlay: null,
			actionToolbar: null as any
		});

		activeRegionIndex = regionIndex;

		// Add click handler to select this region
		rect.on('click tap', () => {
			selectRegion(regionIndex);
		});

		layer.batchDraw();
	}

	function setupTransformer(index: number) {
		if (!layer || index >= blurRegions.length) return;

		const region = blurRegions[index];

		// Remove old transformer if exists
		if (region.transformer) {
			region.transformer.destroy();
		}

		const transformer = new Konva.Transformer({
			nodes: [region.rect],
			borderDash: [5, 5],
			borderStrokeWidth: 2,
			borderStroke: 'white',
			anchorStroke: 'white',
			anchorFill: '#4f46e5',
			anchorStrokeWidth: 2,
			anchorSize: 10,
			anchorCornerRadius: 3,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			rotateEnabled: true,
			rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
			rotateAnchorOffset: -40, // Place rotation handle at bottom
			boundBoxFunc: (oldBox, newBox) => {
				// Limit minimum size
				if (newBox.width < 30 || newBox.height < 30) {
					return oldBox;
				}
				return newBox;
			}
		});

		layer.add(transformer);
		transformer.moveToTop();
		region.transformer = transformer;

		// Create floating action toolbar
		createActionToolbar(index);

		// Add event listeners
		region.rect.on('transform', () => applyBlurToRegion(index));
		region.rect.on('dragmove', () => {
			applyBlurToRegion(index);
			updateActionToolbarPosition(index);
		});
		region.rect.on('transformend', () => {
			updateActionToolbarPosition(index);
			layer.batchDraw();
		});

		updateActionToolbarPosition(index);
	}

	function createActionToolbar(index: number) {
		if (!layer || index >= blurRegions.length) return;

		const region = blurRegions[index];

		// Remove old toolbar if exists
		if (region.actionToolbar) {
			region.actionToolbar.destroy();
		}

		const toolbar = new Konva.Group({
			name: 'actionToolbar'
		});

		// Background for toolbar
		const bg = new Konva.Rect({
			width: 80,
			height: 36,
			fill: 'rgba(0, 0, 0, 0.75)',
			cornerRadius: 18,
			shadowColor: 'black',
			shadowBlur: 10,
			shadowOpacity: 0.3
		});

		// Copy button
		const copyBtn = new Konva.Group({
			x: 12,
			y: 9,
			listening: true
		});
		const copyBg = new Konva.Circle({
			radius: 9,
			fill: 'transparent'
		});
		const copyIcon = new Konva.Path({
			data: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
			fill: 'white',
			scale: { x: 0.6, y: 0.6 },
			offset: { x: 12, y: 12 }
		});
		copyBtn.add(copyBg, copyIcon);
		copyBtn.on('click tap', (e) => {
			e.cancelBubble = true;
			copyRegion(index);
		});
		copyBtn.on('mouseenter', () => {
			stage!.container().style.cursor = 'pointer';
			copyBg.fill('rgba(255, 255, 255, 0.2)');
			layer!.batchDraw();
		});
		copyBtn.on('mouseleave', () => {
			stage!.container().style.cursor = 'default';
			copyBg.fill('transparent');
			layer!.batchDraw();
		});

		// Delete button
		const deleteBtn = new Konva.Group({
			x: 50,
			y: 9,
			listening: true
		});
		const deleteBg = new Konva.Circle({
			radius: 9,
			fill: 'transparent'
		});
		const deleteIcon = new Konva.Path({
			data: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
			fill: '#ef4444',
			scale: { x: 0.6, y: 0.6 },
			offset: { x: 12, y: 12 }
		});
		deleteBtn.add(deleteBg, deleteIcon);
		deleteBtn.on('click tap', (e) => {
			e.cancelBubble = true;
			deleteRegion(index);
		});
		deleteBtn.on('mouseenter', () => {
			stage!.container().style.cursor = 'pointer';
			deleteBg.fill('rgba(239, 68, 68, 0.2)');
			layer!.batchDraw();
		});
		deleteBtn.on('mouseleave', () => {
			stage!.container().style.cursor = 'default';
			deleteBg.fill('transparent');
			layer!.batchDraw();
		});

		toolbar.add(bg, copyBtn, deleteBtn);
		layer.add(toolbar);
		toolbar.moveToTop();

		region.actionToolbar = toolbar;
	}

	function updateActionToolbarPosition(index: number) {
		if (!layer || index >= blurRegions.length) return;

		const region = blurRegions[index];
		if (!region.actionToolbar) return;

		const rect = region.rect.getClientRect();

		// Position toolbar above the blur region, centered
		region.actionToolbar.position({
			x: rect.x + rect.width / 2 - 40,
			y: rect.y - 46
		});

		layer.batchDraw();
	}

	function selectRegion(index: number) {
		if (index >= blurRegions.length) return;

		deselectAllRegions();
		activeRegionIndex = index;

		const region = blurRegions[index];
		if (!region.transformer) {
			setupTransformer(index);
		}

		region.transformer?.show();
		region.actionToolbar?.show();
		layer?.batchDraw();
	}

	function deselectAllRegions() {
		blurRegions.forEach((region) => {
			region.transformer?.hide();
			region.actionToolbar?.hide();
		});
		activeRegionIndex = null;
		layer?.batchDraw();
	}

	function copyRegion(index: number) {
		if (!layer || index >= blurRegions.length) return;

		const sourceRegion = blurRegions[index];
		const rect = sourceRegion.rect;

		// Create a copy offset slightly
		createBlurRegion(rect.x() + 20, rect.y() + 20, rect.width(), rect.height());

		// Apply same rotation
		const newIndex = blurRegions.length - 1;
		blurRegions[newIndex].rect.rotation(rect.rotation());

		setupTransformer(newIndex);
		applyBlurToRegion(newIndex);
		selectRegion(newIndex);
	}

	function deleteRegion(index: number) {
		if (!layer || index >= blurRegions.length) return;

		const region = blurRegions[index];

		// Clean up Konva objects
		region.rect.destroy();
		region.transformer?.destroy();
		region.overlay?.destroy();
		region.actionToolbar?.destroy();

		// Remove from array
		blurRegions.splice(index, 1);

		// Update activeRegionIndex
		if (activeRegionIndex === index) {
			activeRegionIndex = null;
		} else if (activeRegionIndex !== null && activeRegionIndex > index) {
			activeRegionIndex--;
		}

		layer.batchDraw();
	}

	function addNewBlurRegion() {
		if (!stage || !layer) return;

		// Create a default blur region in the center
		const stageWidth = stage.width();
		const stageHeight = stage.height();

		const defaultWidth = 200;
		const defaultHeight = 150;

		createBlurRegion((stageWidth - defaultWidth) / 2, (stageHeight - defaultHeight) / 2, defaultWidth, defaultHeight);

		const newIndex = blurRegions.length - 1;
		setupTransformer(newIndex);
		applyBlurToRegion(newIndex);
		selectRegion(newIndex);
	}

	// Box blur algorithm for smooth blur effect
	function boxBlur(imageData: ImageData, radius: number): ImageData {
		const width = imageData.width;
		const height = imageData.height;
		const data = imageData.data;
		const output = new ImageData(width, height);
		const outData = output.data;

		// Copy alpha channel as-is
		for (let i = 0; i < data.length; i += 4) {
			outData[i + 3] = data[i + 3];
		}

		// Horizontal pass
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let r = 0,
					g = 0,
					b = 0,
					count = 0;

				for (let kx = -radius; kx <= radius; kx++) {
					const px = Math.min(width - 1, Math.max(0, x + kx));
					const idx = (y * width + px) * 4;
					r += data[idx];
					g += data[idx + 1];
					b += data[idx + 2];
					count++;
				}

				const idx = (y * width + x) * 4;
				outData[idx] = r / count;
				outData[idx + 1] = g / count;
				outData[idx + 2] = b / count;
			}
		}

		// Vertical pass
		const temp = new Uint8ClampedArray(outData);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let r = 0,
					g = 0,
					b = 0,
					count = 0;

				for (let ky = -radius; ky <= radius; ky++) {
					const py = Math.min(height - 1, Math.max(0, y + ky));
					const idx = (py * width + x) * 4;
					r += temp[idx];
					g += temp[idx + 1];
					b += temp[idx + 2];
					count++;
				}

				const idx = (y * width + x) * 4;
				outData[idx] = r / count;
				outData[idx + 1] = g / count;
				outData[idx + 2] = b / count;
			}
		}

		return output;
	}

	function applyBlurToRegion(index: number) {
		if (!layer || index >= blurRegions.length || !imageNode || !stage) return;

		const region = blurRegions[index];
		const blurRect = region.rect;

		const image = imageNode.image() as HTMLImageElement;
		if (!image) return;

		// Use native image dimensions for best quality
		const nativeWidth = image.naturalWidth || image.width;
		const nativeHeight = image.naturalHeight || image.height;

		const canvas = document.createElement('canvas');
		canvas.width = nativeWidth;
		canvas.height = nativeHeight;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return;

		// Draw original image at native size
		context.drawImage(image, 0, 0, nativeWidth, nativeHeight);

		// Get blur region absolute transform
		const blurTransform = blurRect.getAbsoluteTransform();

		// Get the four corners of the blur region in stage coordinates
		const corners = [
			blurTransform.point({ x: 0, y: 0 }),
			blurTransform.point({ x: blurRect.width(), y: 0 }),
			blurTransform.point({ x: blurRect.width(), y: blurRect.height() }),
			blurTransform.point({ x: 0, y: blurRect.height() })
		]; // Convert corners to image node local coordinates
		const imageTransform = imageNode.getAbsoluteTransform().copy().invert();
		const imageCorners = corners.map((corner) => imageTransform.point(corner));

		// Find bounding box in image coordinates
		const minX = Math.min(...imageCorners.map((c) => c.x));
		const maxX = Math.max(...imageCorners.map((c) => c.x));
		const minY = Math.min(...imageCorners.map((c) => c.y));
		const maxY = Math.max(...imageCorners.map((c) => c.y));

		// Convert from imageNode coordinates to native image coordinates
		const scaleToNativeX = nativeWidth / imageNode.width();
		const scaleToNativeY = nativeHeight / imageNode.height();

		const imgX = minX * scaleToNativeX;
		const imgY = minY * scaleToNativeY;
		const imgWidth = (maxX - minX) * scaleToNativeX;
		const imgHeight = (maxY - minY) * scaleToNativeY;

		// Clamp to image bounds with integer values
		const clampedX = Math.max(0, Math.floor(Math.min(imgX, nativeWidth)));
		const clampedY = Math.max(0, Math.floor(Math.min(imgY, nativeHeight)));
		const clampedWidth = Math.max(0, Math.floor(Math.min(imgWidth, nativeWidth - clampedX)));
		const clampedHeight = Math.max(0, Math.floor(Math.min(imgHeight, nativeHeight - clampedY)));

		if (clampedWidth === 0 || clampedHeight === 0) return;

		const blurRadius = Math.max(1, Math.round(blurStrength / 2));

		// Extract a larger region that includes padding for blur radius
		// This prevents edge artifacts
		const padding = blurRadius;
		const extractX = Math.max(0, clampedX - padding);
		const extractY = Math.max(0, clampedY - padding);
		const extractWidth = Math.min(nativeWidth - extractX, clampedWidth + padding * 2);
		const extractHeight = Math.min(nativeHeight - extractY, clampedHeight + padding * 2);

		// Extract the padded region
		const imageData = context.getImageData(extractX, extractY, extractWidth, extractHeight);

		// Apply box blur to the entire extracted region
		const blurred = boxBlur(imageData, blurRadius);

		// Calculate the offset within the blurred image where our actual region starts
		const offsetX = clampedX - extractX;
		const offsetY = clampedY - extractY;

		// Extract only the part we want (without the padding) from the blurred result
		const finalBlurred = context.createImageData(clampedWidth, clampedHeight);
		for (let y = 0; y < clampedHeight; y++) {
			for (let x = 0; x < clampedWidth; x++) {
				const srcIdx = ((y + offsetY) * extractWidth + (x + offsetX)) * 4;
				const dstIdx = (y * clampedWidth + x) * 4;
				finalBlurred.data[dstIdx] = blurred.data[srcIdx];
				finalBlurred.data[dstIdx + 1] = blurred.data[srcIdx + 1];
				finalBlurred.data[dstIdx + 2] = blurred.data[srcIdx + 2];
				finalBlurred.data[dstIdx + 3] = blurred.data[srcIdx + 3];
			}
		}

		// Put only the final blurred region back (exact bounds, no bleeding)
		context.putImageData(finalBlurred, clampedX, clampedY);

		// Clean up old overlay if exists
		if (region.overlay) {
			region.overlay.destroy();
			region.overlay = null;
		}

		// Create overlay matching imageNode's display properties
		const overlay = new Konva.Image({
			image: canvas,
			x: imageNode.x(),
			y: imageNode.y(),
			width: imageNode.width(),
			height: imageNode.height(),
			rotation: imageNode.rotation(),
			scaleX: imageNode.scaleX(),
			scaleY: imageNode.scaleY(),
			listening: false
		});

		const parent = imageNode.getParent() || layer;
		parent.add(overlay);
		overlay.zIndex(imageNode.zIndex() + 1);
		blurRect?.moveToTop();
		region.transformer?.moveToTop();
		region.actionToolbar?.moveToTop();

		region.overlay = overlay;
		layer.batchDraw();
	}

	function updateBlurStrength(value?: number) {
		if (typeof value === 'number') {
			blurStrength = value;
		}
		// Reapply blur to all regions
		blurRegions.forEach((_, index) => applyBlurToRegion(index));
	}

	function reset() {
		// Clean up all blur regions and reset state
		cleanupBlurElements();
		if (layer) {
			layer.batchDraw();
		}
		onBlurReset();
	}

	function apply() {
		// If there are blur regions with overlays, merge them with the image
		blurRegions.forEach((region) => {
			if (region.overlay && imageNode && layer) {
				// Update the imageNode with the blurred version
				const canvas = region.overlay.image() as HTMLCanvasElement;
				if (canvas) {
					imageNode.image(canvas);
					layer.draw();
				}
			}
		});

		// Clean up all blur UI elements
		blurRegions.forEach((region) => {
			region.rect.destroy();
			region.transformer?.destroy();
			region.actionToolbar?.destroy();
			region.overlay?.destroy();
		});

		blurRegions = [];
		activeRegionIndex = null;
		startPoint = null;
		isSelecting = false;

		// Redraw the layer to show the applied blur
		if (layer) {
			layer.batchDraw();
		}

		// Call the onBlurApplied callback
		onBlurApplied();
	}

	function cleanupBlurElements() {
		// Safety check: ensure blurRegions array exists
		if (!blurRegions || !Array.isArray(blurRegions)) {
			blurRegions = [];
			return;
		}

		// Clean up all blur regions
		blurRegions.forEach((region) => {
			try {
				region.rect?.destroy();
				region.transformer?.destroy();
				region.overlay?.destroy();
				region.actionToolbar?.destroy();
			} catch (e) {
				console.warn('Error cleaning up blur region:', e);
			}
		});

		blurRegions = [];
		activeRegionIndex = null;

		// Reset cursor style
		if (stage && stage.container()) {
			stage.container().style.cursor = 'default';
		}

		// Reset selection state
		isSelecting = false;
		startPoint = null;
	}

	export function cleanup() {
		cleanupBlurElements();
		if (layer) {
			layer.batchDraw();
		}
	}

	export function saveState() {
		// Save current blur state before switching tools
		// The parent component will handle taking a snapshot
	}

	export function beforeExit() {
		// Called before switching to another tool
		saveState();
		cleanup();
	}

	// Export functions for parent component to call
	export { updateBlurStrength, reset, apply };
</script>

<!-- No inline toolbar needed - controls registered to master toolbar -->
