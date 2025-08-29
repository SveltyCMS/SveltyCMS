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

		// Cleanup event listener on component destroy
		return () => {
			window.removeEventListener('resize', handleResize);
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
		const { imageNode, layer } = imageEditorStore.state;

		// Apply the crop to the image
		imageNode?.setAttrs({
			x,
			y,
			width: Math.max(1, width),
			height: Math.max(1, height),
			clip:
				shape === 'circular'
					? (ctx: CanvasRenderingContext2D) => {
							ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
						}
					: null
		});

		layer?.batchDraw();
		imageEditorStore.setActiveState('');
		applyEdit();
	}

	// Handle watermark applied event
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

<div class="my-4">
	<div class="wrapper !bg-error-500 text-center">
		<p>Current in Development!!! For testing purposes only</p>
	</div>
</div>

<div class="mb-2 flex items-center justify-between gap-2">
	<input class="input my-2 h-10" type="file" accept="image/*" onchange={handleImageUpload} aria-label="Upload image file" />
	{#if storeState.file}
		<button
			onclick={handleUndo}
			disabled={!imageEditorStore.canUndoState}
			aria-label="Undo"
			class="variant-outline-tertiary btn-icon dark:variant-outline-secondary"
		>
			<iconify-icon icon="mdi:undo" width="24" class="text-tertiary-600"></iconify-icon>
		</button>
		<button
			onclick={handleRedo}
			disabled={!imageEditorStore.canRedoState}
			aria-label="Redo"
			class="variant-outline-tertiary btn-icon dark:variant-outline-secondary"
		>
			<iconify-icon icon="mdi:redo" width="24" class="text-tertiary-600"></iconify-icon>
		</button>
		<button type="button" onclick={handleSave} aria-label="Save" class="variant-filled-tertiary btn-icon dark:variant-filled-primary">
			<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
		</button>
	{/if}
</div>

<!-- Image Editor Container -->
<div class="flex h-[calc(100vh-315px)] flex-col items-center justify-center overflow-hidden border-2 border-tertiary-500" bind:this={containerRef}>
	{#if !storeState.file}
		<p class=" text-center text-tertiary-500 dark:text-primary-500">Please upload an image to start editing.</p>
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
