<!-- 
@file: /src/routes/(app)/imageEditor/Sticker.svelte
@component
**This component manages sticker overlays on an image (logic only)**
Handles Konva interactions for adding, transforming, and managing stickers
UI is in StickerToolPanel.svelte

#### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed.
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
- `onStickerChange` (optional): Function to be called when sticker settings change.

#### Exports
- `stickers`: Array of sticker data (for UI)
- `selectedSticker`: Currently selected sticker
- `openFileDialog()`: Trigger file selection
- `selectSticker(sticker)`: Select a sticker
- `deleteSelectedSticker()`: Delete selected sticker
- `deleteAllStickers()`: Delete all stickers
- `bringToFront()`: Move selected to front
- `sendToBack()`: Move selected to back
-->

<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	export interface StickerData {
		id: string;
		imageNode: Konva.Image;
		transformer: Konva.Transformer;
		file: File;
		previewUrl: string;
	}

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onStickerChange?: () => void;
	}

	let { stage, layer, imageNode, onStickerChange }: Props = $props();

	// State for tracking stickers
	let stickers: StickerData[] = $state([]);
	let selectedSticker: StickerData | null = $state(null);

	let stickerFileInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'watermark') {
			activate();
		} else {
			deactivate();
		}
	});

	function activate() {
		if (!layer) return;
		stickers.forEach((sticker) => {
			sticker.imageNode.draggable(true);
		});
		if (selectedSticker) {
			selectedSticker.transformer.nodes([selectedSticker.imageNode]);
			selectedSticker.transformer.show();
		}
		layer.draw();
	}

	function deactivate() {
		if (!layer) return;
		stickers.forEach((sticker) => {
			sticker.imageNode.draggable(false);
			sticker.transformer.hide();
		});
		if (selectedSticker) {
			selectedSticker.transformer.nodes([]);
		}
		layer.draw();
	}

	// Set up click handler on stage to deselect when clicking empty area
	$effect(() => {
		if (!stage) return;

		const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			if (imageEditorStore.state.activeState !== 'watermark') return;
			// If clicked on stage (not on any shape), deselect
			if (e.target === stage || e.target.getType() === 'Layer') {
				if (selectedSticker) {
					selectedSticker.transformer.nodes([]);
					selectedSticker = null;
					layer.draw();
				}
			}
		};

		stage.on('click.watermark tap.watermark', handleStageClick);

		return () => {
			stage.off('click.watermark tap.watermark');
		};
	});

	// Expose stickers and selected for the panel to read
	export function getStickers() {
		return stickers;
	}

	export function getSelectedSticker() {
		return selectedSticker;
	}

	// Cleanup effect
	$effect.root(() => {
		return () => {
			// Clean up all stickers when component unmounts
			stickers.forEach((sticker) => {
				sticker.transformer.destroy();
				sticker.imageNode.destroy();
				URL.revokeObjectURL(sticker.previewUrl);
			});
		};
	});

	function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const file = target.files[0];
			addSticker(file);
			// Reset input so the same file can be added again
			target.value = '';
		}
	}

	function addSticker(file: File) {
		const previewUrl = URL.createObjectURL(file);
		const stickerImage = new Image();
		stickerImage.src = previewUrl;

		stickerImage.onload = () => {
			// Calculate initial size (20% of image width, maintaining aspect ratio)
			const imageWidth = imageNode.width();
			const imageHeight = imageNode.height();
			const maxStickerSize = Math.min(imageWidth, imageHeight) * 0.2;

			const aspectRatio = stickerImage.width / stickerImage.height;
			let stickerWidth = maxStickerSize;
			let stickerHeight = maxStickerSize / aspectRatio;

			if (stickerHeight > maxStickerSize) {
				stickerHeight = maxStickerSize;
				stickerWidth = maxStickerSize * aspectRatio;
			}

			// Position sticker in the center of the image (in image's local coordinate space)
			// The imageNode is typically at (0,0) relative to its parent (imageGroup)
			// So we position relative to the image's dimensions
			const stickerX = imageWidth / 2 - stickerWidth / 2;
			const stickerY = imageHeight / 2 - stickerHeight / 2;

			// Create sticker node
			const konvaImage = new Konva.Image({
				image: stickerImage,
				width: stickerWidth,
				height: stickerHeight,
				x: stickerX,
				y: stickerY,
				draggable: true,
				name: 'watermark'
			});

			// Create transformer for this sticker
			const transformer = new Konva.Transformer({
				nodes: [], // Initially no nodes
				keepRatio: true,
				enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
				rotateEnabled: true,
				borderStrokeWidth: 2,
				anchorSize: 10,
				anchorStrokeWidth: 2,
				anchorFill: '#fff',
				anchorStroke: '#4a90e2',
				borderStroke: '#4a90e2',
				rotateAnchorOffset: 30,
				name: 'watermarkTransformer'
			});
			layer.add(konvaImage);
			layer.add(transformer);
			layer.draw();

			// Create sticker data
			const stickerId = `sticker-${Date.now()}`;
			const stickerData: StickerData = {
				id: stickerId,
				imageNode: konvaImage,
				transformer,
				file,
				previewUrl
			};

			// Add to stickers array
			stickers = [...stickers, stickerData];
			selectSticker(stickerData);

			// Set up click handler to select this sticker
			konvaImage.on('click tap', () => {
				if (imageEditorStore.state.activeState === 'watermark') {
					selectSticker(stickerData);
				}
			});

			// Set up transform event
			konvaImage.on('dragend transformend', () => {
				onStickerChange?.();
			});

			onStickerChange?.();
		};
	}

	export function selectSticker(sticker: StickerData) {
		// Deselect previous
		if (selectedSticker && selectedSticker !== sticker) {
			selectedSticker.transformer.nodes([]);
		}

		// Select new
		selectedSticker = sticker;
		sticker.transformer.nodes([sticker.imageNode]);
		sticker.imageNode.moveToTop();
		sticker.transformer.moveToTop();
		layer.draw();
	}

	export function deleteSelectedSticker() {
		if (!selectedSticker) return;

		// Find and remove from array
		const index = stickers.findIndex((s) => s.id === selectedSticker!.id);
		if (index !== -1) {
			const sticker = stickers[index];

			// Clean up Konva nodes
			sticker.transformer.destroy();
			sticker.imageNode.destroy();

			// Clean up preview URL
			URL.revokeObjectURL(sticker.previewUrl);

			// Remove from array
			stickers = stickers.filter((s) => s.id !== selectedSticker!.id);
			selectedSticker = null;

			layer.draw();
			onStickerChange?.();
		}
	}

	export function deleteAllStickers() {
		if (stickers.length === 0) return;

		// Clean up all stickers
		stickers.forEach((sticker) => {
			sticker.transformer.destroy();
			sticker.imageNode.destroy();
			URL.revokeObjectURL(sticker.previewUrl);
		});

		stickers = [];
		selectedSticker = null;
		layer.draw();
		onStickerChange?.();
	}

	export function bringToFront() {
		if (!selectedSticker) return;

		selectedSticker.imageNode.moveToTop();
		selectedSticker.transformer.moveToTop();
		layer.draw();
		onStickerChange?.();
	}

	export function sendToBack() {
		if (!selectedSticker) return;

		// Move above the main image but below other stickers
		selectedSticker.imageNode.zIndex(1);
		selectedSticker.transformer.moveToTop();
		layer.draw();
		onStickerChange?.();
	}

	export function openFileDialog() {
		stickerFileInput?.click();
	}

	export function apply(onComplete?: () => void) {
		// If no stickers, just deactivate and call callback
		if (stickers.length === 0) {
			deactivate();
			onComplete?.();
			return;
		}

		if (!imageNode || !layer || !stage) {
			console.error('Cannot apply stickers: missing imageNode, layer, or stage');
			deactivate();
			onComplete?.();
			return;
		}

		console.log('🎨 Baking stickers into image');

		// Make all stickers non-draggable
		stickers.forEach((sticker) => {
			sticker.imageNode.draggable(false);
			sticker.transformer.hide();
		});

		// Clear selection
		if (selectedSticker) {
			selectedSticker.transformer.nodes([]);
			selectedSticker = null;
		}

		// Force redraw to ensure clean visual state
		layer.batchDraw();
		stage.batchDraw();

		// Get the imageNode's bounding box in stage coordinates
		// This gives us the exact visible region we need to capture
		const imageNodeRect = imageNode.getClientRect();

		console.log('📐 ImageNode bounds in stage coords:', {
			x: imageNodeRect.x,
			y: imageNodeRect.y,
			width: imageNodeRect.width,
			height: imageNodeRect.height
		});

		// Calculate pixel ratio for high quality rendering
		const imageElement = imageNode.image();
		const naturalWidth = (imageElement as HTMLImageElement)?.naturalWidth || (imageElement as HTMLCanvasElement)?.width || imageNode.width();
		const naturalHeight = (imageElement as HTMLImageElement)?.naturalHeight || (imageElement as HTMLCanvasElement)?.height || imageNode.height();
		const displayWidth = imageNode.width();
		const displayHeight = imageNode.height();
		const pixelRatio = Math.max(naturalWidth / displayWidth, naturalHeight / displayHeight);

		console.log('📐 Bake dimensions:', {
			natural: { width: naturalWidth, height: naturalHeight },
			display: { width: displayWidth, height: displayHeight },
			pixelRatio,
			stickersCount: stickers.length
		});

		// Use stage.toCanvas() to capture the exact region containing the imageNode and stickers
		// This preserves all transformations and positioning automatically
		const canvas = stage.toCanvas({
			x: imageNodeRect.x,
			y: imageNodeRect.y,
			width: imageNodeRect.width,
			height: imageNodeRect.height,
			pixelRatio: pixelRatio
		});

		console.log('🖼️ Canvas created from stage region:', {
			width: canvas.width,
			height: canvas.height
		});

		// Convert canvas to data URL
		const compositeDataURL = canvas.toDataURL('image/png', 1.0);

		// Create new image from the composite
		const newImage = new Image();
		newImage.crossOrigin = 'anonymous';

		newImage.onload = () => {
			// Save current attributes
			const currentWidth = imageNode.width();
			const currentHeight = imageNode.height();
			const currentX = imageNode.x();
			const currentY = imageNode.y();
			const currentRotation = imageNode.rotation();
			const currentScaleX = imageNode.scaleX();
			const currentScaleY = imageNode.scaleY();

			console.log('🖼️ Baking stickered image with preserved transforms');

			// Update the imageNode with the baked image
			imageNode.image(newImage);

			// Restore all attributes
			imageNode.width(currentWidth);
			imageNode.height(currentHeight);
			imageNode.x(currentX);
			imageNode.y(currentY);
			imageNode.rotation(currentRotation);
			imageNode.scaleX(currentScaleX);
			imageNode.scaleY(currentScaleY);

			// IMPORTANT: Clear crop attributes because the baked canvas already has the final result
			// stage.toCanvas() captures the exact visual output, so no crop is needed
			imageNode.cropX(undefined);
			imageNode.cropY(undefined);
			imageNode.cropWidth(undefined);
			imageNode.cropHeight(undefined);

			// Remove all sticker nodes from the layer since they're now baked
			stickers.forEach((sticker) => {
				try {
					sticker.transformer.destroy();
					sticker.imageNode.destroy();
					URL.revokeObjectURL(sticker.previewUrl);
				} catch (e) {
					console.warn('Error destroying sticker:', e);
				}
			});
			stickers = [];
			selectedSticker = null;

			// Clear cache and redraw
			imageNode.clearCache();
			imageNode.cache();
			layer.batchDraw();

			console.log('✅ Stickers baked successfully');

			// Deactivate the tool
			deactivate();

			// Call completion callback
			onComplete?.();
		};

		newImage.onerror = (error) => {
			console.error('Error loading baked sticker image:', error);
			deactivate();
			onComplete?.();
		};

		newImage.src = compositeDataURL;
	}
</script>

<!-- Hidden file input for sticker uploads -->
<input bind:this={stickerFileInput} type="file" accept="image/*" onchange={handleFileChange} class="hidden" aria-label="Upload sticker image" />
