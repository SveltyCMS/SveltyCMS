<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { saveEditedImage } from '@stores/store';
	import PageTitle from '@components/PageTitle.svelte';
	import Konva from 'konva';

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
	import Resize from './Resize.svelte';

	let imageFile: File | null = null;
	let selectedImage: string = '';
	let stage: Konva.Stage;
	let layer: Konva.Layer;
	let imageNode: Konva.Image;
	let containerRef: HTMLDivElement;
	let activeState = '';
	let blurActive = false;

	let stateHistory: string[] = [];
	let currentStateIndex = -1;
	let canUndo = false;
	let canRedo = false;

	onMount(() => {
		const { params } = $page;
		if (params.image) {
			selectedImage = params.image;
		}
	});

	$: if (imageFile) {
		setupKonvaStage();
	}

	function setupKonvaStage() {
		if (!imageFile || !containerRef) return;

		const img = new Image();
		img.src = URL.createObjectURL(imageFile);
		img.onload = () => {
			const containerWidth = containerRef.offsetWidth;
			const containerHeight = containerRef.offsetHeight;
			const scale = Math.min(containerWidth / img.width, containerHeight / img.height);

			stage = new Konva.Stage({
				container: containerRef,
				width: containerWidth,
				height: containerHeight
			});

			layer = new Konva.Layer();
			stage.add(layer);

			imageNode = new Konva.Image({
				image: img,
				x: (containerWidth - img.width * scale) / 2,
				y: (containerHeight - img.height * scale) / 2,
				width: img.width * scale,
				height: img.height * scale
			});

			layer.add(imageNode);
			layer.draw();

			saveState();
		};
	}

	function applyEdit() {
		saveState();
	}

	function handleRotate(event: CustomEvent) {
		const { angle } = event.detail;
		imageNode.rotate(angle);
		layer.batchDraw();
		applyEdit();
	}

	function handleZoom(event: CustomEvent) {
		const { scale } = event.detail;
		imageNode.scale({ x: scale, y: scale });
		layer.batchDraw();
		applyEdit();
	}

	function handleCrop(event: CustomEvent) {
		const { x, y, width, height } = event.detail;
		imageNode.crop({ x, y, width, height });
		imageNode.size({ width, height });
		layer.batchDraw();
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
		}
	}

	async function handleSave() {
		if (stage && imageFile) {
			const dataURL = stage.toDataURL();
			const response = await fetch(dataURL);
			const blob = await response.blob();
			const updatedImageFile = new File([blob], imageFile.name, { type: 'image/png' });

			saveEditedImage.set(true);
		}
	}

	function toggleTool(tool: string) {
		if (activeState === tool) {
			activeState = '';
		} else {
			activeState = tool;
		}
		blurActive = activeState === 'blur';
	}
</script>

<div class="my-2 flex items-center justify-between gap-2">
	<div class="flex items-center">
		<PageTitle name="Image Editor" icon="tdesign:image-edit" />
	</div>
	<button on:click={() => history.back()} class="variant-outline-primary btn-icon" aria-label="Go back">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
	</button>
</div>

<div class="mb-2 flex items-center justify-between gap-2">
	<input class="input my-2" type="file" accept="image/*" on:change={handleImageUpload} aria-label="Upload image file" />
	{#if imageFile}
		<button on:click={handleUndo} disabled={!canUndo} class="variant-outline-tertiary dark:variant-outline-secondary" aria-label="Undo">
			<iconify-icon icon="mdi:undo" width="24" class="text-tertiary-600" />
		</button>
		<button on:click={handleRedo} disabled={!canRedo} class="variant-outline-tertiary dark:variant-outline-secondary" aria-label="Redo">
			<iconify-icon icon="mdi:redo" width="24" class="text-tertiary-600" />
		</button>
		<button type="button" on:click={handleSave} class="variant-filled-tertiary btn-icon dark:variant-filled-primary" aria-label="Save">
			<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		</button>
	{/if}
</div>

<!-- Image Editor Container -->
<div class="image-editor-wrapper mb-2 h-[calc(100vh-225px)] overflow-hidden">
	<div class="image-editor" bind:this={containerRef}>
		{#if stage && layer && imageNode}
			<!-- Conditionally display the tool components based on the active state -->
			{#if activeState === 'rotate'}
				<Rotate {stage} {layer} {imageNode} on:rotate={handleRotate} />
			{:else if activeState === 'blur'}
				<Blur {stage} {layer} {imageNode} />
			{:else if activeState === 'crop'}
				<Crop {stage} {layer} {imageNode} on:crop={handleCrop} />
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
				<ShapeOverlay {stage} {layer} {imageNode} />
			{:else if activeState === 'resize'}
				<Resize {stage} {layer} {imageNode} />
			{/if}
		{:else if !imageFile}
			<p class="no-image-message">Please upload an image to start editing.</p>
		{/if}
	</div>

	<!-- Tool Controls -->
	<div class="tool-controls-container">
		<div class="tool-buttons-row">
			<button on:click={() => toggleTool('rotate')} disabled={!imageFile} aria-label="Rotate">
				<iconify-icon icon="mdi:rotate-right" width="24" class="text-tertiary-600" />
				Rotate
			</button>
			<button on:click={() => toggleTool('blur')} disabled={!imageFile} aria-label="Blur">
				<iconify-icon icon="mdi:blur" width="24" class="text-tertiary-600" />
				Blur
			</button>
			<button on:click={() => toggleTool('crop')} disabled={!imageFile} aria-label="Crop">
				<iconify-icon icon="mdi:crop" width="24" class="text-tertiary-600" />
				Crop
			</button>
			<button on:click={() => toggleTool('zoom')} disabled={!imageFile} aria-label="Zoom">
				<iconify-icon icon="mdi:magnify" width="24" class="text-tertiary-600" />
				Zoom
			</button>
			<button on:click={() => toggleTool('focalpoint')} disabled={!imageFile} aria-label="Focal Point">
				<iconify-icon icon="mdi:focus-field" width="24" class="text-tertiary-600" />
				Focal Point
			</button>
			<button on:click={() => toggleTool('watermark')} disabled={!imageFile} aria-label="Watermark">
				<iconify-icon icon="mdi:watermark" width="24" class="text-tertiary-600" />
				Watermark
			</button>
			<button on:click={() => toggleTool('filter')} disabled={!imageFile} aria-label="Filter">
				<iconify-icon icon="mdi:filter-variant" width="24" class="text-tertiary-600" />
				Filter
			</button>
			<button on:click={() => toggleTool('textoverlay')} disabled={!imageFile} aria-label="Add Text">
				<iconify-icon icon="mdi:format-text" width="24" class="text-tertiary-600" />
				Add Text
			</button>
			<button on:click={() => toggleTool('shapeoverlay')} disabled={!imageFile} aria-label="Add Shape">
				<iconify-icon icon="mdi:shape" width="24" class="text-tertiary-600" />
				Add Shape
			</button>
			<button on:click={() => toggleTool('resize')} disabled={!imageFile} aria-label="Resize">
				<iconify-icon icon="mdi:resize" width="24" class="text-tertiary-600" />
				Resize
			</button>
		</div>
	</div>
</div>

{#if $saveEditedImage}
	<div class="success-message" role="alert">Image saved successfully!</div>
{/if}

<style>
	.image-editor-wrapper {
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.image-editor {
		flex-grow: 1;
		width: 100%;
		position: relative;
		border: 1px solid #ccc;
		overflow: hidden;
	}

	.tool-controls-container {
		background-color: var(--surface-300);
		padding: 8px;
		overflow-x: auto;
		white-space: nowrap;
	}

	.tool-buttons-row {
		display: flex;
		gap: 8px;
	}

	.tool-buttons-row button {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px;
		background-color: var(--tertiary);
		color: white;
		border: none;
		border-radius: 5px;
		cursor: pointer;
	}

	.tool-buttons-row button:disabled {
		background-color: #cccccc;
		cursor: not-allowed;
	}

	.no-image-message {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
	}

	.success-message {
		padding: 10px;
		background-color: #4caf50;
		color: white;
		border-radius: 5px;
		text-align: center;
		margin-top: 10px;
	}

	/* Styles for Undo/Redo buttons on mobile */
	@media (max-width: 768px) {
		.mb-2 button[aria-label='Undo'],
		.mb-2 button[aria-label='Redo'] {
			padding: 8px;
			width: 40px;
			height: 40px;
			display: flex;
			justify-content: center;
			align-items: center;
		}

		.mb-2 button[aria-label='Undo'] p,
		.mb-2 button[aria-label='Redo'] p {
			display: none;
		}
	}
</style>
