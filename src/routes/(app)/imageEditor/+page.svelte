<!-- 
@file: /src/routes/(app)/imageEditor/+page.svelte
@component
**An image editor component that handles uploading images**
Users can upload an image, applying various editing tools (crop, blur, rotate, zoom, focal point, watermark, filters, text overlay, and shape overlay), and saving the edited image.

#### Props
- `imageFile` (optional): File object of the uploaded image.

-->
<script lang="ts">
	import { onMount } from 'svelte';

	// Store
	import { page } from '$app/state';
	import { saveEditedImage } from '@stores/store.svelte';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// Import individual tool components
	import Crop from './Crop.svelte';
	import Blur from './Blur.svelte';
	import Rotate from './Rotate.svelte';
	import Zoom from './Zoom.svelte';
	import FocalPoint from './FocalPoint.svelte';
	import Watermark from './Watermark.svelte';
	import Filter from './Filter.svelte';
	import TextOverlay from './TextOverlay.svelte';
	import ShapeOverlay from './ShapeOverlay.svelte';

	// Konva
	import Konva from 'konva';

	let selectedImage: string = '';
	let containerRef: HTMLDivElement | undefined = $state();
	// Store the original image for resetting
	let originalImage: HTMLImageElement;

	// Get store state reactively
	const storeState = $derived(imageEditorStore.state);

	// Use reactive statements for better type inference with explicit type assertions
	let stage = $derived(storeState.stage);
	let layer = $derived(storeState.layer);
	let imageNode = $derived(storeState.imageNode);
	let imageGroup = $derived(storeState.imageGroup);

	$effect(() => {
		stage = storeState.stage as Konva.Stage | null;
		layer = storeState.layer as Konva.Layer | null;
		imageNode = storeState.imageNode as Konva.Image | null;
		imageGroup = storeState.imageGroup as Konva.Group | null;
	});

	onMount(() => {
		const { params } = page;
		if (params.image) {
			selectedImage = params.image;
			loadImageAndSetupKonva(selectedImage);
		}

		// Add window resize event listener
		window.addEventListener('resize', handleResize);

		// Add keyboard event listener for Esc key
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				const currentState = imageEditorStore.state.activeState;
				if (currentState) {
					// Exit current tool
					imageEditorStore.setActiveState('');
					imageEditorStore.cleanupTempNodes();
				}
			}
		}

		window.addEventListener('keydown', handleKeyDown);

		// Cleanup event listeners on component destroy
		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('keydown', handleKeyDown);
		};
	});

	function handleResize() {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !imageNode || !imageGroup || !originalImage || !containerRef) return;

		stage.width(containerRef.offsetWidth);
		stage.height(containerRef.offsetHeight);

		const containerWidth = Math.max(1, containerRef.offsetWidth);
		const containerHeight = Math.max(1, containerRef.offsetHeight);
		const scale = Math.min(containerWidth / originalImage.width, containerHeight / originalImage.height);
		const newW = Math.max(1, originalImage.width * scale);
		const newH = Math.max(1, originalImage.height * scale);
		imageNode.width(newW);
		imageNode.height(newH);
		// Keep image centered relative to group origin (0,0)
		imageNode.position({ x: -newW / 2, y: -newH / 2 });
		// Keep group centered in stage
		imageGroup.position({ x: stage.width() / 2, y: stage.height() / 2 });
		imageEditorStore.state.layer?.batchDraw();
	}

	function loadImageAndSetupKonva(imageSrc: string) {
		if (!containerRef) {
			console.error('Container reference is not set');
			return;
		}

		// Clean up any previous stage to avoid memory leaks when loading a new image
		const { stage } = imageEditorStore.state;
		if (stage) {
			stage.destroy();
			imageEditorStore.reset();
			// Re-assign containerRef after reset (since reset clears stage references)
		}

		const img = new window.Image();
		img.src = imageSrc;
		img.onload = () => {
			if (img.width > 0 && img.height > 0) {
				console.log('Image loaded successfully with dimensions:', img.width, img.height);
				originalImage = img; // Store original image for resize handling
				setupKonvaStage(img);
			} else {
				console.error('Image has invalid dimensions:', img.width, img.height);
			}
		};
		img.onerror = () => {
			console.error('Failed to load image:', imageSrc);
		};
	}

	function setupKonvaStage(img: HTMLImageElement) {
		if (!containerRef) return;

		const containerWidth = Math.max(1, containerRef.offsetWidth);
		const containerHeight = Math.max(1, containerRef.offsetHeight);
		const scale = Math.min(containerWidth / img.width, containerHeight / img.height);

		// Ensure non-zero dimensions
		const stageWidth = Math.max(1, containerWidth);
		const stageHeight = Math.max(1, containerHeight);

		const stage = new Konva.Stage({
			container: containerRef,
			width: stageWidth,
			height: stageHeight
		});

		const layer = new Konva.Layer();
		stage.add(layer);

		// Wrap image in group with image centered at group origin for stable rotation
		const group = new Konva.Group({ name: 'imageGroup' });
		layer.add(group);
		const imgW = Math.max(1, img.width * scale);
		const imgH = Math.max(1, img.height * scale);
		const imageNode = new Konva.Image({
			image: img,
			x: -imgW / 2,
			y: -imgH / 2,
			width: imgW,
			height: imgH
		});
		group.add(imageNode);
		group.position({ x: stageWidth / 2, y: stageHeight / 2 });
		layer.draw();

		// Update store with Konva objects
		imageEditorStore.setStage(stage);
		imageEditorStore.setLayer(layer);
		imageEditorStore.setImageNode(imageNode);
		imageEditorStore.setImageGroup(group);

		saveState();
	}

	function applyEdit() {
		saveState();
	}

	function handleRotate(angle: number) {
		const { imageGroup, layer } = imageEditorStore.state;
		if (imageGroup) {
			const normalized = ((angle % 360) + 360) % 360;
			imageGroup.rotation(normalized);
			layer?.batchDraw();
		}
	}

	function handleCrop(data: { x: number; y: number; width: number; height: number; shape: string }) {
		const { x, y, width, height, shape } = data;
		console.log('Crop data:', data);

		// Save current state before applying crop
		saveState();

		// Get the current imageNode from store state
		const currentImageNode = storeState.imageNode;
		if (!currentImageNode) {
			console.error('No image node available for cropping');
			return;
		}

		try {
			// Create a new canvas to draw the cropped image
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				console.error('Could not get canvas context');
				return;
			}

			// Set canvas size to crop dimensions
			canvas.width = width;
			canvas.height = height;

			// Get the current image element
			const imageElement = currentImageNode.image() as HTMLImageElement;
			if (!imageElement) {
				console.error('No image element found');
				return;
			}

			if (shape === 'circular') {
				// For circular crops, create a circular clipping mask
				ctx.save();
				ctx.beginPath();
				ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
				ctx.clip();
				ctx.drawImage(imageElement, x, y, width, height, 0, 0, width, height);
				ctx.restore();
			} else {
				// For rectangular crops, draw the cropped portion
				ctx.drawImage(imageElement, x, y, width, height, 0, 0, width, height);
			}

			// Create new image from the cropped canvas
			const croppedImageSrc = canvas.toDataURL('image/png', 1.0);
			const newImage = new Image();

			newImage.onload = () => {
				// Update the image node with the new cropped image
				currentImageNode.image(newImage);

				// Center the cropped image in the editor
				const stage = storeState.stage;
				if (stage) {
					const stageWidth = stage.width();
					const stageHeight = stage.height();

					// Calculate center position
					const centerX = stageWidth / 2;
					const centerY = stageHeight / 2;

					// Reset container transforms first
					const container = storeState.imageGroup ?? currentImageNode;
					if (container !== currentImageNode) {
						container.x(0);
						container.y(0);
					}
					container.scaleX(1);
					container.scaleY(1);
					container.rotation(0);

					// Position the image node at center
					currentImageNode.x(centerX - newImage.width / 2);
					currentImageNode.y(centerY - newImage.height / 2);
					
					// If using a group container, center the group instead
					if (container !== currentImageNode) {
						container.x(centerX);
						container.y(centerY);
						currentImageNode.x(-newImage.width / 2);
						currentImageNode.y(-newImage.height / 2);
					}
				}

				// Clear any existing clip function
				currentImageNode.clipFunc(null);

				// Clean up crop tool and temporary nodes
				imageEditorStore.cleanupTempNodes();

				// Force redraw
				layer?.batchDraw();
				console.log('Crop applied successfully');

				// Update store state and apply edit
				imageEditorStore.setActiveState('');
				applyEdit();
			};

			newImage.src = croppedImageSrc;
		} catch (error) {
			console.error('Error applying crop:', error);
		}
	} // Handle watermark applied event
	function handleWatermarkApplied() {
		imageEditorStore.setActiveState('');
		applyEdit();
	}

	// Handle text overlay applied event
	function handleTextOverlayApplied() {
		imageEditorStore.setActiveState('');
		applyEdit();
	}

	// Handle shape overlay applied event
	function handleShapeOverlayApplied() {
		imageEditorStore.setActiveState('');
		applyEdit();
	}

	// Fix for undo/redo functionality
	function saveState() {
		const { stage, imageGroup, imageNode } = imageEditorStore.state;
		if (!stage || !imageNode) return;
		try {
			// Store both visual snapshot AND original image properties for quality preservation
			const dataURL = stage.toDataURL();
			const snapshot = {
				dataURL,
				group: imageGroup
					? {
							rotation: imageGroup.rotation(),
							x: imageGroup.x(),
							y: imageGroup.y(),
							scaleX: imageGroup.scaleX(),
							scaleY: imageGroup.scaleY()
						}
					: undefined,
				// Preserve original image dimensions and source for lossless restoration
				imageProps: {
					width: imageNode.width(),
					height: imageNode.height(),
					x: imageNode.x(),
					y: imageNode.y(),
					// Store reference to original image to avoid compression
					originalImageSrc: originalImage ? originalImage.src : selectedImage
				}
			};
			imageEditorStore.saveStateHistory(snapshot);
		} catch (e) {
			console.error('Failed saving editor state snapshot', e);
		}
	}

	function handleUndo() {
		const snap = imageEditorStore.undoState();
		if (snap) loadState(snap);
	}

	function handleRedo() {
		const snap = imageEditorStore.redoState();
		if (snap) loadState(snap);
	}

	function loadState(snapshot: {
		dataURL: string;
		group?: { rotation: number; x: number; y: number; scaleX: number; scaleY: number };
		imageProps?: { width: number; height: number; x: number; y: number; originalImageSrc: string };
	}) {
		const { imageNode, layer, imageGroup } = imageEditorStore.state;

		// If we have original image properties, restore using the original image for better quality
		if (snapshot.imageProps && originalImage && imageNode) {
			// Use original image to avoid compression artifacts
			imageNode.image(originalImage);
			imageNode.setAttrs({
				width: snapshot.imageProps.width,
				height: snapshot.imageProps.height,
				x: snapshot.imageProps.x,
				y: snapshot.imageProps.y
			});

			// Restore group transforms
			if (snapshot.group && imageGroup) {
				imageGroup.rotation(snapshot.group.rotation);
				imageGroup.position({ x: snapshot.group.x, y: snapshot.group.y });
				imageGroup.scale({ x: snapshot.group.scaleX, y: snapshot.group.scaleY });
			}

			layer?.draw();
		} else {
			// Fallback to dataURL method for older snapshots
			const img = new window.Image();
			img.onload = () => {
				if (imageNode) {
					imageNode.image(img);
				}
				if (snapshot.group && imageGroup) {
					imageGroup.rotation(snapshot.group.rotation);
					imageGroup.position({ x: snapshot.group.x, y: snapshot.group.y });
					imageGroup.scale({ x: snapshot.group.scaleX, y: snapshot.group.scaleY });
				}
				layer?.draw();
			};
			img.src = snapshot.dataURL;
		}
	}

	function handleImageUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const imageFile = target.files[0];
			imageEditorStore.setFile(imageFile);
			selectedImage = URL.createObjectURL(imageFile);
			loadImageAndSetupKonva(selectedImage);
		}
	}

	async function handleSave() {
		const { stage, file } = imageEditorStore.state;
		if (stage && file) {
			const dataURL = stage.toDataURL();
			const response = await fetch(dataURL);
			await response.blob();

			// Image saved successfully
			saveEditedImage.set(true);

			// Show saved notification
			const notification = document.querySelector('.success-message');
			if (notification) {
				notification.classList.add('show');
				setTimeout(() => {
					notification.classList.remove('show');
				}, 3000);
			}
		}
	}

	function toggleTool(tool: string) {
		const currentState = imageEditorStore.state.activeState;
		// Cleanup any temporary nodes left by previous tool before switching
		if (currentState && currentState !== tool) {
			imageEditorStore.cleanupTempNodes();
		}
		const newState = currentState === tool ? '' : tool;
		imageEditorStore.setActiveState(newState);
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name="Image Editor" icon="tdesign:image-edit" showBackButton={true} backUrl="/config" />

<!-- Compact Controls Bar -->
<div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-100 p-3 dark:bg-surface-800">
	<!-- Left side - File upload and warning -->
	<div class="flex items-center gap-3">
		<div class="relative">
			<input id="image-upload" class="peer sr-only" type="file" accept="image/*" onchange={handleImageUpload} aria-label="Upload image file" />
			<label for="image-upload" class="variant-filled-primary btn cursor-pointer px-4 py-2 text-sm font-medium">
				<iconify-icon icon="mdi:upload" width="18" class="mr-2"></iconify-icon>
				Choose Image
			</label>
		</div>

		<div class="hidden items-center gap-2 text-xs text-warning-600 dark:text-warning-400 sm:flex">
			<iconify-icon icon="mdi:alert" width="16"></iconify-icon>
			<span>Dev Mode</span>
		</div>
	</div>

	<!-- Right side - Action buttons -->
	{#if storeState.file}
		<div class="flex items-center gap-2">
			<span class="hidden text-sm text-tertiary-600 dark:text-tertiary-400 sm:inline">
				{storeState.file.name}
			</span>
			<div class="flex gap-1">
				<button
					onclick={handleUndo}
					disabled={!imageEditorStore.canUndoState}
					aria-label="Undo"
					class="variant-soft-tertiary btn-icon hover:variant-filled-tertiary disabled:opacity-50"
					title="Undo"
				>
					<iconify-icon icon="mdi:undo" width="18"></iconify-icon>
				</button>
				<button
					onclick={handleRedo}
					disabled={!imageEditorStore.canRedoState}
					aria-label="Redo"
					class="variant-soft-tertiary btn-icon hover:variant-filled-tertiary disabled:opacity-50"
					title="Redo"
				>
					<iconify-icon icon="mdi:redo" width="18"></iconify-icon>
				</button>
				<button type="button" onclick={handleSave} aria-label="Save" class="variant-filled-success btn-icon" title="Save Image">
					<iconify-icon icon="material-symbols:save" width="18"></iconify-icon>
				</button>
			</div>
		</div>
	{/if}
</div>

<!-- Image Editor Container -->
<div
	class="flex h-[calc(100vh-280px)] flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-surface-300 bg-surface-50 dark:border-surface-600 dark:bg-surface-900"
	bind:this={containerRef}
>
	{#if !storeState.file}
		<div class="flex flex-col items-center gap-4 text-center">
			<div class="rounded-full bg-surface-200 p-6 dark:bg-surface-700">
				<iconify-icon icon="mdi:image-plus" width="48" class="text-surface-400 dark:text-surface-500"></iconify-icon>
			</div>
			<div>
				<h3 class="text-lg font-medium text-surface-700 dark:text-surface-300">No Image Selected</h3>
				<p class="mt-1 text-sm text-surface-500 dark:text-surface-400">Choose an image above to start editing</p>
			</div>
		</div>
	{/if}
</div>

<!-- svelte-ignore a11y_missing_attribute -->
<div class="relative">
	{#if stage && layer && imageNode && storeState.file}
		<!-- Conditionally display the tool components based on the active state -->
		{#if storeState.activeState === 'rotate'}
			<Rotate
				{stage}
				{layer}
				{imageNode}
				imageGroup={storeState.imageGroup}
				onRotate={handleRotate}
				onRotateApplied={() => {
					imageEditorStore.setActiveState('');
					applyEdit();
				}}
				onRotateCancelled={() => {
					imageEditorStore.setActiveState('');
				}}
			/>
		{:else if storeState.activeState === 'blur'}
			<Blur
				{stage}
				{layer}
				{imageNode}
				onBlurApplied={() => {
					imageEditorStore.setActiveState('');
					applyEdit();
				}}
				onBlurReset={() => {
					imageEditorStore.setActiveState('');
				}}
			/>
		{:else if storeState.activeState === 'crop'}
			<Crop
				{stage}
				{layer}
				{imageNode}
				imageGroup={storeState.imageGroup}
				onCrop={handleCrop}
				onCancelCrop={() => {
					imageEditorStore.setActiveState('');
				}}
			/>
		{:else if storeState.activeState === 'zoom'}
			<Zoom
				{stage}
				{layer}
				{imageNode}
				imageGroup={storeState.imageGroup}
				onZoomApplied={() => {
					imageEditorStore.setActiveState('');
					applyEdit();
				}}
				onZoomCancelled={() => {
					imageEditorStore.setActiveState('');
				}}
			/>
		{:else if storeState.activeState === 'focalpoint'}
			<FocalPoint
				{stage}
				{layer}
				{imageNode}
				onFocalpoint={(data: { x: number; y: number }) => {
					const { x, y } = data;
					const centerX = (stage?.width() ?? 0) / 2;
					const centerY = (stage?.height() ?? 0) / 2;
					imageNode?.position({
						x: centerX - x,
						y: centerY - y
					});
					layer?.batchDraw();
				}}
				onFocalpointApplied={() => {
					imageEditorStore.setActiveState('');
					applyEdit();
				}}
				onFocalpointRemoved={() => {
					imageEditorStore.setActiveState('');
					applyEdit();
				}}
			/>
		{:else if storeState.activeState === 'watermark'}
			<Watermark {stage} {layer} {imageNode} onExitWatermark={handleWatermarkApplied} />
		{:else if storeState.activeState === 'filter'}
			<Filter
				{stage}
				{layer}
				{imageNode}
				onFilterApplied={() => {
					imageEditorStore.setActiveState('');
					applyEdit();
				}}
			/>
		{:else if storeState.activeState === 'textoverlay'}
			<TextOverlay {stage} {layer} {imageNode} onExitTextOverlay={handleTextOverlayApplied} />
		{:else if storeState.activeState === 'shapeoverlay'}
			<ShapeOverlay {stage} {layer} onExitShapeOverlay={handleShapeOverlayApplied} />
		{/if}

		<!-- Tool Controls -->
		{#if storeState.activeState === ''}
			<div class="relative mt-3 flex flex-wrap items-center justify-center gap-2">
				<button onclick={() => toggleTool('rotate')} aria-label="Rotate" class="mx-2">
					<iconify-icon icon="mdi:rotate-right" width="24" class="text-tertiary-600"></iconify-icon>
					Rotate
				</button>
				<button onclick={() => toggleTool('blur')} aria-label="Blur" class="mx-2">
					<iconify-icon icon="mdi:blur" width="24" class="text-tertiary-600"></iconify-icon>
					Blur
				</button>
				<button onclick={() => toggleTool('crop')} aria-label="Crop" class="mx-2">
					<iconify-icon icon="mdi:crop" width="24" class="text-tertiary-600"></iconify-icon>
					Crop
				</button>
				<button onclick={() => toggleTool('zoom')} aria-label="Zoom" class="mx-2">
					<iconify-icon icon="mdi:magnify" width="24" class="text-tertiary-600"></iconify-icon>
					Zoom
				</button>
				<button onclick={() => toggleTool('focalpoint')} aria-label="Focal Point" class="mx-2">
					<iconify-icon icon="mdi:focus-field" width="24" class="text-tertiary-600"></iconify-icon>
					Focal Point
				</button>
				<button onclick={() => toggleTool('watermark')} aria-label="Watermark" class="mx-2">
					<iconify-icon icon="mdi:watermark" width="24" class="text-tertiary-600"></iconify-icon>
					Watermark
				</button>
				<button onclick={() => toggleTool('filter')} aria-label="Filter" class="mx-2">
					<iconify-icon icon="mdi:filter-variant" width="24" class="text-tertiary-600"></iconify-icon>
					Filter
				</button>
				<button onclick={() => toggleTool('textoverlay')} aria-label="Add Text" class="mx-2">
					<iconify-icon icon="mdi:format-text" width="24" class="text-tertiary-600"></iconify-icon>
					Add Text
				</button>
				<button onclick={() => toggleTool('shapeoverlay')} aria-label="Add Shape" class="mx-2">
					<iconify-icon icon="mdi:shape" width="24" class="text-tertiary-600"></iconify-icon>
					Add Shape
				</button>
			</div>
		{/if}
	{/if}
</div>

<div class="success-message" role="alert">Image saved successfully!</div>

<style>
	.success-message {
		position: fixed;
		bottom: 20px;
		right: 20px;
		background-color: #4caf50; /* Green background */
		color: white;
		padding: 15px;
		border-radius: 5px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		opacity: 0;
		transition: opacity 0.3s ease;
		z-index: 1000;
	}
</style>
