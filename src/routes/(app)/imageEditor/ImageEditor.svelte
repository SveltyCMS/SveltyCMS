<script lang="ts">
	import { onMount } from 'svelte';
	import Konva from 'konva';
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
	import { saveImage } from '@utils/media';

	export let imageFile: File | null = null;

	enum WATERMARK_POSITION {
		'top-left' = 'top-left',
		'top-center' = 'top-center',
		'top-right' = 'top-right',
		'center-left' = 'center-left',
		'center' = 'center',
		'center-right' = 'center-right',
		'bottom-left' = 'bottom-left',
		'bottom-center' = 'bottom-center',
		'bottom-right' = 'bottom-right'
	}

	let stage: Konva.Stage;
	let layer: Konva.Layer;
	let imageNode: Konva.Image;
	let watermarkNode: Konva.Image;
	let containerRef: HTMLDivElement;
	let activeState = '';

	// Watermark properties
	let watermarkFile: File | null = null;
	let watermarkPosition: WATERMARK_POSITION = WATERMARK_POSITION.center;
	let watermarkOpacity = 1;
	let watermarkScale = 100;
	let watermarkOffsetX = 0;
	let watermarkOffsetY = 0;
	let watermarkRotation = 0;

	// Undo/Redo properties
	let stateHistory: string[] = [];
	let currentStateIndex = -1;
	let canUndo = false;
	let canRedo = false;

	onMount(() => {
		if (!imageFile) return;

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
	});

	function applyWatermark() {
		if (!watermarkFile || !stage) return;

		const watermarkImg = new Image();
		watermarkImg.src = URL.createObjectURL(watermarkFile);
		watermarkImg.onload = () => {
			if (watermarkNode) watermarkNode.destroy();

			watermarkNode = new Konva.Image({
				image: watermarkImg,
				opacity: watermarkOpacity,
				rotation: watermarkRotation
			});

			const scaleX = watermarkScale / 100;
			const scaleY = watermarkScale / 100;
			watermarkNode.scale({ x: scaleX, y: scaleY });

			const imageWidth = imageNode.width();
			const imageHeight = imageNode.height();
			const watermarkWidth = watermarkNode.width() * scaleX;
			const watermarkHeight = watermarkNode.height() * scaleY;

			let x, y;
			switch (watermarkPosition) {
				case 'top-left':
					x = watermarkOffsetX;
					y = watermarkOffsetY;
					break;
				case 'top-center':
					x = (imageWidth - watermarkWidth) / 2 + watermarkOffsetX;
					y = watermarkOffsetY;
					break;
				case 'top-right':
					x = imageWidth - watermarkWidth + watermarkOffsetX;
					y = watermarkOffsetY;
					break;
				case 'center-left':
					x = watermarkOffsetX;
					y = (imageHeight - watermarkHeight) / 2 + watermarkOffsetY;
					break;
				case 'center':
					x = (imageWidth - watermarkWidth) / 2 + watermarkOffsetX;
					y = (imageHeight - watermarkHeight) / 2 + watermarkOffsetY;
					break;
				case 'center-right':
					x = imageWidth - watermarkWidth + watermarkOffsetX;
					y = (imageHeight - watermarkHeight) / 2 + watermarkOffsetY;
					break;
				case 'bottom-left':
					x = watermarkOffsetX;
					y = imageHeight - watermarkHeight + watermarkOffsetY;
					break;
				case 'bottom-center':
					x = (imageWidth - watermarkWidth) / 2 + watermarkOffsetX;
					y = imageHeight - watermarkHeight + watermarkOffsetY;
					break;
				case 'bottom-right':
					x = imageWidth - watermarkWidth + watermarkOffsetX;
					y = imageHeight - watermarkHeight + watermarkOffsetY;
					break;
			}

			watermarkNode.position({ x, y });
			layer.add(watermarkNode);
			layer.draw();

			applyEdit();
		};
	}

	export function getEditedImage(): Promise<File | null> {
		return new Promise((resolve) => {
			if (!stage || !imageFile) {
				resolve(null);
				return;
			}

			const dataURL = stage.toDataURL();
			fetch(dataURL)
				.then((res) => res.blob())
				.then((blob) => {
					const file = new File([blob], imageFile.name, { type: 'image/png' });
					resolve(file);
				})
				.catch(() => resolve(null));
		});
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

	function applyEdit() {
		saveState();
	}

	function handleCrop(event: CustomEvent) {
		const { x, y, width, height, shape } = event.detail;

		// Create a new canvas element
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');

		if (!context) {
			console.error('Failed to get 2D context');
			return;
		}

		canvas.width = width;
		canvas.height = height;

		// Draw the cropped portion of the image onto the new canvas
		context.drawImage(imageNode.image() as HTMLImageElement, x, y, width, height, 0, 0, width, height);

		if (shape === 'circular') {
			context.globalCompositeOperation = 'destination-in';
			context.beginPath();
			context.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
			context.closePath();
			context.fill();
		}

		// Create a new image from the canvas
		const croppedImage = new Image();
		croppedImage.onload = () => {
			// Update the Konva image with the new cropped image
			imageNode.image(croppedImage);
			imageNode.width(width);
			imageNode.height(height);

			// Reset the position of the image node
			imageNode.position({ x: 0, y: 0 });

			layer.batchDraw();
			applyEdit();
		};
		croppedImage.src = canvas.toDataURL();
	}

	function handleBlur(event: CustomEvent) {
		const { blurRadius } = event.detail;
		imageNode.cache();
		imageNode.filters([Konva.Filters.Blur]);
		imageNode.blurRadius(blurRadius);
		layer.batchDraw();
		applyEdit();
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

	function handleFocalPoint(event: CustomEvent) {
		const { x, y } = event.detail;
		// For focal point, we might adjust the image position to center on this point
		const stage = imageNode.getStage();
		if (stage) {
			const centerX = stage.width() / 2;
			const centerY = stage.height() / 2;
			imageNode.position({
				x: centerX - x,
				y: centerY - y
			});
			layer.batchDraw();
			applyEdit();
		}
	}

	function handleFilter(event: CustomEvent) {
		const { filterType, value } = event.detail;
		imageNode.cache();

		let filters = imageNode.filters() || [];

		switch (filterType) {
			case 'brighten':
				filters = filters.filter((f) => f !== Konva.Filters.Brighten);
				filters.push(Konva.Filters.Brighten);
				imageNode.brightness(value);
				break;
			case 'contrast':
				filters = filters.filter((f) => f !== Konva.Filters.Contrast);
				filters.push(Konva.Filters.Contrast);
				imageNode.contrast(value);
				break;
			case 'saturation':
				filters = filters.filter((f) => f !== Konva.Filters.HSL);
				filters.push(Konva.Filters.HSL);
				imageNode.saturation(value);
				break;
			case 'hue':
				filters = filters.filter((f) => f !== Konva.Filters.HSL);
				filters.push(Konva.Filters.HSL);
				imageNode.hue(value);
				break;
			case 'value':
				filters = filters.filter((f) => f !== Konva.Filters.HSV);
				filters.push(Konva.Filters.HSV);
				imageNode.value(value);
				break;
			case 'blur':
				filters = filters.filter((f) => f !== Konva.Filters.Blur);
				filters.push(Konva.Filters.Blur);
				imageNode.blurRadius(value);
				break;
			case 'noise':
				filters = filters.filter((f) => f !== Konva.Filters.Noise);
				filters.push(Konva.Filters.Noise);
				imageNode.noise(value);
				break;
			case 'pixelate':
				filters = filters.filter((f) => f !== Konva.Filters.Pixelate);
				filters.push(Konva.Filters.Pixelate);
				imageNode.pixelSize(value);
				break;
			case 'threshold':
				filters = filters.filter((f) => f !== Konva.Filters.Threshold);
				filters.push(Konva.Filters.Threshold);
				imageNode.threshold(value);
				break;
			case 'posterize':
				filters = filters.filter((f) => f !== Konva.Filters.Posterize);
				filters.push(Konva.Filters.Posterize);
				imageNode.levels(value);
				break;
			case 'sepia':
				if (value) {
					filters = filters.filter((f) => f !== Konva.Filters.Sepia);
					filters.push(Konva.Filters.Sepia);
				} else {
					filters = filters.filter((f) => f !== Konva.Filters.Sepia);
				}
				break;
			case 'invert':
				if (value) {
					filters = filters.filter((f) => f !== Konva.Filters.Invert);
					filters.push(Konva.Filters.Invert);
				} else {
					filters = filters.filter((f) => f !== Konva.Filters.Invert);
				}
				break;
			case 'grayscale':
				if (value) {
					filters = filters.filter((f) => f !== Konva.Filters.Grayscale);
					filters.push(Konva.Filters.Grayscale);
				} else {
					filters = filters.filter((f) => f !== Konva.Filters.Grayscale);
				}
				break;
			case 'enhance':
				filters = filters.filter((f) => f !== Konva.Filters.Enhance);
				filters.push(Konva.Filters.Enhance);
				imageNode.enhance(value);
				break;
			case 'solarize':
				filters = filters.filter((f) => f !== Konva.Filters.Solarize);
				filters.push(Konva.Filters.Solarize);
				imageNode.threshold(value);
				break;
			case 'rgb':
				filters = filters.filter((f) => f !== Konva.Filters.RGB);
				filters.push(Konva.Filters.RGB);
				imageNode.red(value.r);
				imageNode.green(value.g);
				imageNode.blue(value.b);
				break;
		}

		imageNode.filters(filters);
		layer.batchDraw();
		applyEdit();
	}

	function handleTextOverlay(event: CustomEvent) {
		const { text, x, y, fontSize, fill } = event.detail;
		const textNode = new Konva.Text({
			x: x,
			y: y,
			text: text,
			fontSize: fontSize,
			fill: fill,
			draggable: true
		});
		layer.add(textNode);
		layer.batchDraw();
		applyEdit();
	}

	function handleShapeOverlay(event: CustomEvent) {
		const { shapeType, x, y, width, height, fill } = event.detail;
		let shape;
		switch (shapeType) {
			case 'rectangle':
				shape = new Konva.Rect({
					x: x,
					y: y,
					width: width,
					height: height,
					fill: fill,
					draggable: true
				});
				break;
			case 'circle':
				shape = new Konva.Circle({
					x: x + width / 2,
					y: y + height / 2,
					radius: Math.min(width, height) / 2,
					fill: fill,
					draggable: true
				});
				break;
			// Add more shape types as needed
		}
		if (shape) {
			layer.add(shape);
			layer.batchDraw();
			applyEdit();
		}
	}

	function handleResize(event: CustomEvent) {
		const { width, height } = event.detail;
		imageNode.width(width);
		imageNode.height(height);
		layer.batchDraw();
		applyEdit();
	}
</script>

<div class="image-editor" bind:this={containerRef}>
	{#if stage && layer && imageNode}
		{#if activeState === 'crop'}
			<Crop {stage} {layer} {imageNode} on:crop={handleCrop} />
		{:else if activeState === 'blur'}
			<Blur {stage} {layer} {imageNode} />
		{:else if activeState === 'rotate'}
			<Rotate {stage} {layer} {imageNode} on:rotate={handleRotate} />
		{:else if activeState === 'zoom'}
			<Zoom {stage} {layer} {imageNode} on:zoom={handleZoom} />
		{:else if activeState === 'focalpoint'}
			<FocalPoint {stage} {layer} {imageNode} on:focalpoint={handleFocalPoint} />
		{:else if activeState === 'watermark'}
			<Watermark
				bind:watermarkFile
				bind:position={watermarkPosition}
				bind:opacity={watermarkOpacity}
				bind:scale={watermarkScale}
				bind:offsetX={watermarkOffsetX}
				bind:offsetY={watermarkOffsetY}
				bind:rotation={watermarkRotation}
				on:change={applyWatermark}
			/>
		{:else if activeState === 'filter'}
			<Filter {stage} {layer} {imageNode} on:filter={handleFilter} />
		{:else if activeState === 'text'}
			<TextOverlay {stage} {layer} on:textoverlay={handleTextOverlay} />
		{:else if activeState === 'shape'}
			<ShapeOverlay {stage} {layer} on:shapeoverlay={handleShapeOverlay} />
		{:else if activeState === 'resize'}
			<Resize {stage} {layer} {imageNode} on:resize={handleResize} />
		{/if}
	{/if}
</div>

<div class="controls">
	<button on:click={() => (activeState = 'crop')}>Crop</button>
	<button on:click={() => (activeState = 'blur')}>Blur</button>
	<button on:click={() => (activeState = 'rotate')}>Rotate</button>
	<button on:click={() => (activeState = 'zoom')}>Zoom</button>
	<button on:click={() => (activeState = 'focalpoint')}>Focal Point</button>
	<button on:click={() => (activeState = 'watermark')}>Watermark</button>
	<button on:click={() => (activeState = 'filter')}>Filter</button>
	<button on:click={() => (activeState = 'text')}>Add Text</button>
	<button on:click={() => (activeState = 'shape')}>Add Shape</button>
	<button on:click={() => (activeState = 'resize')}>Resize</button>
	<button on:click={handleUndo} disabled={!canUndo}>Undo</button>
	<button on:click={handleRedo} disabled={!canRedo}>Redo</button>
</div>

<style>
	.image-editor {
		width: 100%;
		height: 80vh;
		position: relative;
	}

	.controls {
		display: flex;
		justify-content: space-around;
		padding: 10px;
		flex-wrap: wrap;
	}

	button {
		padding: 10px 20px;
		background-color: #4caf50;
		color: white;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		margin: 5px;
	}

	button:hover {
		background-color: #45a049;
	}

	button:disabled {
		background-color: #cccccc;
		cursor: not-allowed;
	}
</style>
