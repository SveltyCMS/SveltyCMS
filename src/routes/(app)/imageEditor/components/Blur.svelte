<!-- 
@file src/routes/(app)/imageEditor/components/Blur.svelte
@component
**Blur effect component using Konva canvas used for image editing**
Handles the blur region selection and application.
UI components are external (BlurTopToolbar).

### Props
- `stage`: Konva.Stage - The Konva stage
- `layer`: Konva.Layer - The Konva layer where the image and effects are added
- `imageNode`: Konva.Image - The Konva image node representing the original image
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

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		blurStrength?: number;
		onBlurReset?: () => void;
		onBlurApplied?: () => void;
	}

	let { stage, layer, imageNode, blurStrength = $bindable(10), onBlurReset = () => {}, onBlurApplied = () => {} } = $props() as Props;

	let blurRegion: Konva.Rect | null = null;
	let transformer: Konva.Transformer | null = null;
	let isSelecting = $state(false);
	let startPoint = $state<{ x: number; y: number } | null>(null);
	let mosaicOverlay: Konva.Image | null = null;
	let mounted = false;

	// Initialize stage event listeners
	$effect(() => {
		if (!mounted && stage && layer && imageNode) {
			mounted = true;
			console.log('Blur tool mounted, initializing...');

			stage.on('mousedown touchstart', handleMouseDown);
			stage.on('mousemove touchmove', handleMouseMove);
			stage.on('mouseup touchend', handleMouseUp);
			stage.container().style.cursor = 'crosshair';

			// Cleanup function
			return () => {
				console.log('Blur tool unmounting, cleaning up...');
				stage.off('mousedown touchstart', handleMouseDown);
				stage.off('mousemove touchmove', handleMouseMove);
				stage.off('mouseup touchend', handleMouseUp);
				stage.container().style.cursor = 'default';

				// Clean up blur elements when component is destroyed
				cleanupBlurElements();
			};
		}
	});

	function handleMouseDown() {
		if (blurRegion) return;

		isSelecting = true;
		const pos = stage.getPointerPosition();
		startPoint = pos ? { x: pos.x, y: pos.y } : null;
	}

	function handleMouseMove() {
		if (!isSelecting || !startPoint) return;

		const pos = stage.getPointerPosition();
		if (!pos) return;

		if (!blurRegion) {
			blurRegion = new Konva.Rect({
				x: startPoint.x,
				y: startPoint.y,
				width: pos.x - startPoint.x,
				height: pos.y - startPoint.y,
				stroke: 'white',
				strokeWidth: 1,
				dash: [5, 5],
				draggable: true
			});
			layer.add(blurRegion);
		} else {
			blurRegion.width(pos.x - startPoint.x);
			blurRegion.height(pos.y - startPoint.y);
		}
		layer.batchDraw();
	}

	function handleMouseUp() {
		if (!isSelecting) return;

		isSelecting = false;

		if (blurRegion) {
			const width = Math.abs(blurRegion.width());
			const height = Math.abs(blurRegion.height());
			blurRegion.width(width);
			blurRegion.height(height);
			if (blurRegion.x() > blurRegion.x() + width) {
				blurRegion.x(blurRegion.x() - width);
			}
			if (blurRegion.y() > blurRegion.y() + height) {
				blurRegion.y(blurRegion.y() - height);
			}

			transformer = new Konva.Transformer({
				nodes: [blurRegion],
				borderDash: [5, 5],
				borderStrokeWidth: 1,
				borderStroke: 'white',
				anchorStroke: '#0000FF',
				anchorFill: '#0000FF',
				anchorSize: 12, // Increased size
				anchorCornerRadius: 6,
				enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
				rotateAnchorOffset: 30,
				rotateEnabled: false // Disable rotate functionality
			});

			// Add custom rotate anchor at the bottom
			const rotateAnchor = new Konva.Circle({
				x: blurRegion.width() / 2,
				y: blurRegion.height() + 30,
				radius: 8,
				fill: '#0000FF',
				stroke: '#0000FF',
				strokeWidth: 2,
				draggable: true,
				dragBoundFunc: function (pos) {
					if (!blurRegion) return pos;
					const center = {
						x: blurRegion.x() + blurRegion.width() / 2,
						y: blurRegion.y() + blurRegion.height() / 2
					};
					const angle = Math.atan2(pos.y - center.y, pos.x - center.x);
					blurRegion.rotation((angle * 180) / Math.PI);
					applyMosaic();
					return {
						x: center.x + Math.cos(angle) * (blurRegion.height() / 2 + 30),
						y: center.y + Math.sin(angle) * (blurRegion.height() / 2 + 30)
					};
				}
			});

			transformer.add(rotateAnchor);
			layer.add(transformer);

			blurRegion.on('transform', applyMosaic);
			blurRegion.on('dragmove', applyMosaic);

			layer.batchDraw();
			applyMosaic();
		}
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

	function applyMosaic() {
		if (!blurRegion) return;

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

		// Get blur region in stage coordinates
		const rect = blurRegion.getClientRect();

		// Convert to image node local coordinates
		const transform = imageNode.getAbsoluteTransform().copy().invert();
		const topLeft = transform.point({ x: rect.x, y: rect.y });
		const topRight = transform.point({ x: rect.x + rect.width, y: rect.y });
		const bottomLeft = transform.point({ x: rect.x, y: rect.y + rect.height });
		const bottomRight = transform.point({ x: rect.x + rect.width, y: rect.y + rect.height });

		const minX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
		const maxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
		const minY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
		const maxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);

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

		console.log('Blur region:', {
			clampedX,
			clampedY,
			clampedWidth,
			clampedHeight,
			nativeWidth,
			nativeHeight
		});

		const blurRadius = Math.max(1, Math.round(blurStrength / 2));
		console.log('Applying blur with radius:', blurRadius);

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

		if (mosaicOverlay) {
			mosaicOverlay.destroy();
			mosaicOverlay = null;
		}

		// Create overlay matching imageNode's display properties
		mosaicOverlay = new Konva.Image({
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
		parent.add(mosaicOverlay);
		mosaicOverlay.zIndex(imageNode.zIndex() + 1);
		blurRegion?.moveToTop();
		transformer?.moveToTop();
		layer.batchDraw();
	}

	function updateBlurStrength(value?: number) {
		if (typeof value === 'number') {
			blurStrength = value;
		}
		applyMosaic();
	}

	function reset() {
		// Clean up blur elements and reset state
		cleanupBlurElements();
		layer.batchDraw();
		onBlurReset();
	}

	function apply() {
		// Take snapshot before applying final blur
		const { takeSnapshot } = imageEditorStore;
		takeSnapshot();

		// If there's a blur region and overlay, merge it with the image
		if (mosaicOverlay && blurRegion) {
			// Update the imageNode with the blurred version
			const canvas = mosaicOverlay.image() as HTMLCanvasElement;
			if (canvas) {
				const img = new Image();
				img.onload = () => {
					imageNode.image(img);
					layer.batchDraw();
				};
				img.src = canvas.toDataURL();
			}
		}

		onBlurApplied();
	}

	function cleanupBlurElements() {
		console.log('Cleaning up blur elements');

		// Clean up blur region
		if (blurRegion) {
			blurRegion.destroy();
			blurRegion = null;
		}

		// Clean up transformer
		if (transformer) {
			transformer.destroy();
			transformer = null;
		}

		// Clean up mosaic overlay
		if (mosaicOverlay) {
			mosaicOverlay.destroy();
			mosaicOverlay = null;
		}

		// Reset cursor style
		if (stage && stage.container()) {
			stage.container().style.cursor = 'default';
		}

		// Reset selection state
		isSelecting = false;
		startPoint = null;
	}

	export function cleanup() {
		console.log('Blur tool cleanup called');
		cleanupBlurElements();
		layer.batchDraw();
	}

	export function saveState() {
		// Save current blur state before switching tools
		console.log('Saving blur tool state', { blurStrength });
		// The parent component will handle taking a snapshot
	}

	export function beforeExit() {
		// Called before switching to another tool
		console.log('Blur tool beforeExit called');
		saveState();
		cleanup();
	}

	// Export functions for parent component to call
	export { updateBlurStrength, reset, apply };
</script>
