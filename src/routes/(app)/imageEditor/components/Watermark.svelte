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

	// Debug log to verify component mounts
	console.log('Sticker component mounted');

	// Set up click handler on stage to deselect when clicking empty area
	$effect(() => {
		if (!stage) return;

		const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			// If clicked on stage (not on any shape), deselect
			if (e.target === stage || e.target.getType() === 'Layer') {
				if (selectedSticker) {
					selectedSticker.transformer.nodes([]);
					selectedSticker = null;
					layer.draw();
				}
			}
		};

		stage.on('click tap', handleStageClick);

		return () => {
			stage.off('click tap', handleStageClick);
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
		// Take snapshot before adding sticker
		imageEditorStore.takeSnapshot();

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
				nodes: [konvaImage],
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
			}); // Add to layer
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
			selectedSticker = stickerData;

			// Set up click handler to select this sticker
			konvaImage.on('click tap', () => {
				selectSticker(stickerData);
			});

			// Set up transform event to take snapshots
			konvaImage.on('dragend transformend', () => {
				imageEditorStore.takeSnapshot();
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
		layer.draw();
	}

	export function deleteSelectedSticker() {
		if (!selectedSticker) return;

		// Take snapshot before deleting
		imageEditorStore.takeSnapshot();

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

		// Take snapshot before deleting all
		imageEditorStore.takeSnapshot();

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

		imageEditorStore.takeSnapshot();
		selectedSticker.imageNode.moveToTop();
		selectedSticker.transformer.moveToTop();
		layer.draw();
		onStickerChange?.();
	}

	export function sendToBack() {
		if (!selectedSticker) return;

		imageEditorStore.takeSnapshot();
		// Move above the main image but below other stickers
		selectedSticker.imageNode.moveToBottom();
		selectedSticker.imageNode.moveUp(); // Move above the main image
		selectedSticker.transformer.moveToTop();
		layer.draw();
		onStickerChange?.();
	}

	export function openFileDialog() {
		stickerFileInput?.click();
	}

	// Handle stage clicks to deselect stickers
	$effect(() => {
		if (!stage) return;

		const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
			// If clicked on empty area, deselect
			const target = e.target;
			if (target === stage || target.getType() === 'Layer' || target === imageNode) {
				if (selectedSticker) {
					selectedSticker.transformer.nodes([]);
					selectedSticker = null;
					layer.draw();
				}
			}
		};

		stage.on('click', handleStageClick);

		return () => {
			stage.off('click', handleStageClick);
		};
	});
</script>

<!-- Hidden file input for sticker uploads -->
<input bind:this={stickerFileInput} type="file" accept="image/*" onchange={handleFileChange} class="hidden" aria-label="Upload sticker image" />
