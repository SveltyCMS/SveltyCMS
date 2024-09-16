<!-- 
@file: /src/routes/(app)/imageEditor/+page.svelte
@description: This is the main page component for the image editor. It handles uploading images, applying various editing tools (crop, blur, rotate, zoom, focal point, watermark, filters, text overlay, and shape overlay), and saving the edited image.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	// Store
	import { page } from '$app/stores';
	import { saveEditedImage } from '@stores/store';

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

	let imageFile: File | null = null;
	let selectedImage: string = '';
	let stage: Konva.Stage;
	let layer: Konva.Layer;
	let imageNode: Konva.Image;
	let containerRef: HTMLDivElement;
	let activeState = '';
	let blurActive = false;
	let updatedImageFile: File | null = null;
	let stateHistory: string[] = [];
	let currentStateIndex = -1;
	let canUndo = false;
	let canRedo = false;

	onMount(() => {
		const { params } = $page;
		if (params.image) {
			selectedImage = params.image;
			loadImageAndSetupKonva(selectedImage);
		}
	});

	function loadImageAndSetupKonva(imageSrc: string) {
		if (!containerRef) {
			console.error('Container reference is not set');
			return;
		}

		const img = new Image();
		img.src = imageSrc;
		img.onload = () => {
			if (img.width > 0 && img.height > 0) {
				console.log('Image loaded successfully with dimensions:', img.width, img.height);
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

		stage = new Konva.Stage({
			container: containerRef,
			width: stageWidth,
			height: stageHeight
		});

		layer = new Konva.Layer();
		stage.add(layer);

		imageNode = new Konva.Image({
			image: img,
			x: (stageWidth - img.width * scale) / 2,
			y: (stageHeight - img.height * scale) / 2,
			width: Math.max(1, img.width * scale),
			height: Math.max(1, img.height * scale)
		});

		layer.add(imageNode);
		layer.draw();

		saveState();
	}

	function applyEdit() {
		saveState();
	}

	function handleRotate(event: CustomEvent) {
		const { angle } = event.detail;
		imageNode.rotation(angle);
		layer.batchDraw();
	}

	function handleZoom(event: CustomEvent) {
		const { scale } = event.detail;
		imageNode.scale({ x: scale, y: scale });
		layer.batchDraw();
		applyEdit();
	}

	function handleCrop(event: CustomEvent) {
		const { x, y, width, height, shape } = event.detail;

		// Apply the crop to the image
		imageNode.setAttrs({
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

		layer.batchDraw();
		activeState = '';
		applyEdit();
	}

	function handleFocalPoint(event: CustomEvent) {
		const { x, y } = event.detail;
		const centerX = stage.width() / 2;
		const centerY = stage.height() / 2;
		imageNode.position({
			x: centerX - x,
			y: centerY - y
		});
		layer.batchDraw();
		applyEdit();
	}

	function saveState() {
		const state = stage.toDataURL();
		stateHistory = stateHistory.slice(0, currentStateIndex + 1);
		stateHistory.push(state);
		currentStateIndex++;
		updateUndoRedoState();
	}

	function updateUndoRedoState() {
		canUndo = currentStateIndex > 0;
		canRedo = currentStateIndex < stateHistory.length - 1;
	}

	function handleUndo() {
		if (!canUndo) return;
		currentStateIndex--;
		loadState(stateHistory[currentStateIndex]);
		updateUndoRedoState();
	}

	function handleRedo() {
		if (!canRedo) return;
		currentStateIndex++;
		loadState(stateHistory[currentStateIndex]);
		updateUndoRedoState();
	}

	function loadState(state: string) {
		const img = new Image();
		img.onload = () => {
			imageNode.image(img);
			layer.draw();
		};
		img.src = state;
	}

	function handleImageUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			imageFile = target.files[0];
			selectedImage = URL.createObjectURL(imageFile);
			loadImageAndSetupKonva(selectedImage);
		}
	}

	async function handleSave() {
		if (stage && imageFile) {
			const dataURL = stage.toDataURL();
			const response = await fetch(dataURL);
			const blob = await response.blob();
			updatedImageFile = new File([blob], imageFile.name, { type: 'image/png' });

			// You can now use updatedImageFile for other operations, such as uploading
			saveEditedImage.set(true);
		}
	}

	function toggleTool(tool: string) {
		activeState = activeState === tool ? '' : tool;
		updateToolUI();
	}

	function updateToolUI() {
		// Implement logic to show or hide the tool controls based on `activeState`.
		const toolbars = document.querySelectorAll(
			'.tool-controls-container .blur-controls, .tool-controls-container .crop-controls, .tool-controls-container .rotate-controls'
		);
		toolbars.forEach((toolbar) => {
			toolbar.classList.add('hidden');
		});

		if (activeState) {
			const activeToolbar = document.querySelector(`.${activeState}-controls`);
			if (activeToolbar) {
				activeToolbar.classList.remove('hidden');
			}
		}
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name="Image Editor" icon="tdesign:image-edit" showBackButton={true} backUrl="/config" />

<div class="my-4">
	<div class="wrapper !bg-error-500 text-center">
		<p>Current in Development!!! For testing purposes only</p>
		<p>Environment Data is only shown to role admin</p>
	</div>
</div>

<div class="mb-2 flex items-center justify-between gap-2">
	<input class="input my-2 h-10" type="file" accept="image/*" on:change={handleImageUpload} aria-label="Upload image file" />
	{#if imageFile}
		<button on:click={handleUndo} disabled={!canUndo} class="variant-outline-tertiary btn-icon dark:variant-outline-secondary" aria-label="Undo">
			<iconify-icon icon="mdi:undo" width="24" class="text-tertiary-600" />
		</button>
		<button on:click={handleRedo} disabled={!canRedo} class="variant-outline-tertiary btn-icon dark:variant-outline-secondary" aria-label="Redo">
			<iconify-icon icon="mdi:redo" width="24" class="text-tertiary-600" />
		</button>
		<button type="button" on:click={handleSave} class="variant-filled-tertiary btn-icon btn-icon dark:variant-filled-primary" aria-label="Save">
			<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		</button>
	{/if}
</div>

<!-- Image Editor Container -->
<div class="mb-2 flex h-[calc(100vh-225px)] flex-col items-center justify-center overflow-hidden" bind:this={containerRef}>
	{#if !imageFile}
		<p class="mb-4 text-center text-tertiary-500 dark:text-primary-500">Please upload an image to start editing.</p>
	{/if}

	{#if stage && layer && imageNode && imageFile}
		<!-- Conditionally display the tool components based on the active state -->
		{#if activeState === 'rotate'}
			<Rotate
				{stage}
				{layer}
				{imageNode}
				on:rotate={handleRotate}
				on:rotateApplied={() => {
					activeState = '';
					applyEdit();
				}}
				on:rotateCancelled={() => {
					activeState = '';
				}}
			/>
		{:else if activeState === 'blur'}
			<Blur
				{stage}
				{layer}
				{imageNode}
				on:blurApplied={() => {
					activeState = '';
					blurActive = false;
				}}
			/>
		{:else if activeState === 'crop'}
			<Crop
				{stage}
				{layer}
				{imageNode}
				on:crop={handleCrop}
				on:cancelCrop={() => {
					activeState = '';
				}}
			/>
		{:else if activeState === 'zoom'}
			<Zoom {stage} {layer} {imageNode} on:zoom={handleZoom} />
		{:else if activeState === 'focalpoint'}
			<FocalPoint {stage} {layer} {imageNode} on:focalpoint={handleFocalPoint} />
		{:else if activeState === 'watermark'}
			<Watermark {stage} {layer} {imageNode} />
		{:else if activeState === 'filter'}
			<Filter {stage} {layer} {imageNode} />
		{:else if activeState === 'textoverlay'}
			<TextOverlay {stage} {layer} {imageNode} />
		{:else if activeState === 'shapeoverlay'}
			<ShapeOverlay {stage} {layer} />
		{/if}

		<!-- Tool Controls -->
		{#if activeState === ''}
			<div class="wrapper mt-4 flex flex-wrap items-center justify-center gap-2">
				<button on:click={() => toggleTool('rotate')} aria-label="Rotate" class="mx-2">
					<iconify-icon icon="mdi:rotate-right" width="24" class="text-tertiary-600" />
					Rotate
				</button>
				<button on:click={() => toggleTool('blur')} aria-label="Blur" class="mx-2">
					<iconify-icon icon="mdi:blur" width="24" class="text-tertiary-600" />
					Blur
				</button>
				<button on:click={() => toggleTool('crop')} aria-label="Crop" class="mx-2">
					<iconify-icon icon="mdi:crop" width="24" class="text-tertiary-600" />
					Crop
				</button>
				<button on:click={() => toggleTool('zoom')} aria-label="Zoom" class="mx-2">
					<iconify-icon icon="mdi:magnify" width="24" class="text-tertiary-600" />
					Zoom
				</button>
				<button on:click={() => toggleTool('focalpoint')} aria-label="Focal Point" class="mx-2">
					<iconify-icon icon="mdi:focus-field" width="24" class="text-tertiary-600" />
					Focal Point
				</button>
				<button on:click={() => toggleTool('watermark')} aria-label="Watermark" class="mx-2">
					<iconify-icon icon="mdi:watermark" width="24" class="text-tertiary-600" />
					Watermark
				</button>
				<button on:click={() => toggleTool('filter')} aria-label="Filter" class="mx-2">
					<iconify-icon icon="mdi:filter-variant" width="24" class="text-tertiary-600" />
					Filter
				</button>
				<button on:click={() => toggleTool('textoverlay')} aria-label="Add Text" class="mx-2">
					<iconify-icon icon="mdi:format-text" width="24" class="text-tertiary-600" />
					Add Text
				</button>
				<button on:click={() => toggleTool('shapeoverlay')} aria-label="Add Shape" class="mx-2">
					<iconify-icon icon="mdi:shape" width="24" class="text-tertiary-600" />
					Add Shape
				</button>
			</div>
		{/if}
	{/if}
</div>

{#if $saveEditedImage}
	<div class="success-message" role="alert">Image saved successfully!</div>
{/if}
