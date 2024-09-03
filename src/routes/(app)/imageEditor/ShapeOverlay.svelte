<!-- ShapeOverlay.svelte -->
<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;

	let shapeType = 'rectangle';
	let fillColor = '#ffffff';
	let strokeColor = '#000000';
	let strokeWidth = 2;
	let opacity = 1;

	let shapes: Konva.Shape[] = [];
	let selectedShape: Konva.Shape | null = null;

	onMount(() => {
		stage.on('click tap', (e) => {
			if (e.target === stage) {
				selectShape(null);
			}
		});
	});

	function addShape() {
		let shape: Konva.Shape;
		const commonProps = {
			fill: fillColor,
			stroke: strokeColor,
			strokeWidth: strokeWidth,
			opacity: opacity,
			draggable: true
		};

		if (shapeType === 'rectangle') {
			shape = new Konva.Rect({
				x: stage.width() / 2 - 50,
				y: stage.height() / 2 - 25,
				width: 100,
				height: 50,
				...commonProps
			});
		} else if (shapeType === 'circle') {
			shape = new Konva.Circle({
				x: stage.width() / 2,
				y: stage.height() / 2,
				radius: 50,
				...commonProps
			});
		} else if (shapeType === 'ellipse') {
			shape = new Konva.Ellipse({
				x: stage.width() / 2,
				y: stage.height() / 2,
				radiusX: 75,
				radiusY: 50,
				...commonProps
			});
		} else {
			// Default to rectangle if an unknown shape type is selected
			shape = new Konva.Rect({
				x: stage.width() / 2 - 50,
				y: stage.height() / 2 - 25,
				width: 100,
				height: 50,
				...commonProps
			});
		}

		shape.on('click tap', () => selectShape(shape));
		shape.on('dragend', () => layer.draw());

		layer.add(shape);
		shapes = [...shapes, shape];
		selectShape(shape);
		layer.draw();
	}

	function selectShape(shape: Konva.Shape | null) {
		if (selectedShape) {
			selectedShape.strokeEnabled(true);
		}
		selectedShape = shape;
		if (shape) {
			shape.strokeEnabled(false);
			fillColor = shape.fill();
			strokeColor = shape.stroke();
			strokeWidth = shape.strokeWidth();
			opacity = shape.opacity();
		}
		layer.draw();
	}

	function updateSelectedShape() {
		if (selectedShape) {
			selectedShape.fill(fillColor);
			selectedShape.stroke(strokeColor);
			selectedShape.strokeWidth(strokeWidth);
			selectedShape.opacity(opacity);
			layer.draw();
		}
	}

	function deleteSelectedShape() {
		if (selectedShape) {
			selectedShape.destroy();
			shapes = shapes.filter((s) => s !== selectedShape);
			selectShape(null);
			layer.draw();
		}
	}

	function bringToFront() {
		if (selectedShape) {
			selectedShape.moveToTop();
			layer.draw();
		}
	}

	function sendToBack() {
		if (selectedShape) {
			selectedShape.moveToBottom();
			layer.draw();
		}
	}
</script>

<div class="shape-overlay-controls absolute bottom-4 right-4 z-50 rounded-md bg-gray-800 p-4 text-white">
	<h3 class="mb-4 text-lg font-bold">Shape Overlay</h3>

	<div class="mb-4 grid grid-cols-2 gap-4">
		<label class="flex flex-col">
			<span class="mb-1">Shape Type:</span>
			<select bind:value={shapeType} class="rounded px-2 py-1 text-black">
				<option value="rectangle">Rectangle</option>
				<option value="circle">Circle</option>
				<option value="ellipse">Ellipse</option>
			</select>
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Fill Color:</span>
			<input type="color" bind:value={fillColor} on:input={updateSelectedShape} class="h-8" />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Stroke Color:</span>
			<input type="color" bind:value={strokeColor} on:input={updateSelectedShape} class="h-8" />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Stroke Width: {strokeWidth}px</span>
			<input type="range" min="0" max="20" step="1" bind:value={strokeWidth} on:input={updateSelectedShape} />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Opacity: {opacity.toFixed(2)}</span>
			<input type="range" min="0" max="1" step="0.01" bind:value={opacity} on:input={updateSelectedShape} />
		</label>
	</div>

	<div class="flex flex-wrap gap-2">
		<button on:click={addShape} class="gradient-primary btn">Add Shape</button>
		<button on:click={deleteSelectedShape} class="gradient-danger btn" disabled={!selectedShape}>Delete</button>
		<button on:click={bringToFront} class="gradient-secondary btn" disabled={!selectedShape}>Bring to Front</button>
		<button on:click={sendToBack} class="gradient-tertiary btn" disabled={!selectedShape}>Send to Back</button>
	</div>
</div>

<style>
	.shape-overlay-controls {
		background-color: rgba(0, 0, 0, 0.6);
		max-width: 400px;
	}

	input[type='range'] {
		width: 100%;
		margin: 0;
	}

	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.25rem;
		font-weight: bold;
		cursor: pointer;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.gradient-primary {
		background: linear-gradient(to right, #4f46e5, #818cf8);
	}

	.gradient-secondary {
		background: linear-gradient(to right, #059669, #34d399);
	}

	.gradient-tertiary {
		background: linear-gradient(to right, #d97706, #fbbf24);
	}

	.gradient-danger {
		background: linear-gradient(to right, #dc2626, #f87171);
	}
</style>
