<!-- 
@file: /src/routes/(app)/imageEditor/ShapeOverlay.svelte
@description: This component allows users to overlay shapes (rectangles, circles, ellipses) onto an image. 
              Users can adjust the fill color, stroke color, stroke width, opacity, and manage the shape's position on the canvas.
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount, createEventDispatcher } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;

	let shapeType = 'rectangle';
	let fillColor: string = '#ffffff';
	let strokeColor: string = '#000000';
	let strokeWidth = 2;
	let opacity = 1;

	let shapes: Konva.Shape[] = [];
	let selectedShape: Konva.Shape | null = null;

	const dispatch = createEventDispatcher();

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
			fill: fillColor as string,
			stroke: strokeColor as string,
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
			fillColor = shape.fill() as string;
			strokeColor = shape.stroke() as string;
			strokeWidth = shape.strokeWidth();
			opacity = shape.opacity();
		}
		layer.draw();
	}

	function updateSelectedShape() {
		if (selectedShape) {
			selectedShape.fill(fillColor as string);
			selectedShape.stroke(strokeColor as string);
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

	function exitShapeOverlay() {
		dispatch('exitShapeOverlay');
	}
</script>

<!-- Shape Overlay Controls UI -->
<div class="wrapper fixed bottom-0 left-0 right-0 z-50 flex flex-col space-y-4">
	<h3 class=" relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Shape Overlay</h3>

	<button on:click={exitShapeOverlay} class="variant-ghost-primary btn-icon absolute -top-2 right-2 font-bold"> Exit </button>

	<div class="grid grid-cols-2 gap-2">
		<label class="flex flex-col">
			<span class="mb-1">Shape Type:</span>
			<select bind:value={shapeType} class="input">
				<option value="rectangle">Rectangle</option>
				<option value="circle">Circle</option>
				<option value="ellipse">Ellipse</option>
			</select>
		</label>

		<div class="flex items-center justify-around gap-2">
			<label class="flex flex-col">
				<span class="mb-1">Fill Color:</span>
				<input type="color" bind:value={fillColor} on:input={updateSelectedShape} class="input" />
			</label>

			<label class="flex flex-col">
				<span class="mb-1">Stroke Color:</span>
				<input type="color" bind:value={strokeColor} on:input={updateSelectedShape} class="input" />
			</label>
		</div>

		<label class="flex flex-col">
			<span class="mb-1">Stroke Width: {strokeWidth}px</span>
			<input type="range" min="0" max="20" step="1" bind:value={strokeWidth} on:input={updateSelectedShape} class="input" />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Opacity: {opacity.toFixed(2)}</span>
			<input type="range" min="0" max="1" step="0.01" bind:value={opacity} on:input={updateSelectedShape} class=" input" />
		</label>
	</div>

	<div class="mt-4 flex justify-between space-x-2">
		<button on:click={addShape} class="variant-filled-primary btn w-full">Add Shape</button>
		<button on:click={deleteSelectedShape} class="variant-filled-error btn w-full" disabled={!selectedShape}>Delete</button>
		<button on:click={bringToFront} class="variant-outline btn w-full" disabled={!selectedShape}>Bring to Front</button>
		<button on:click={sendToBack} class="variant-outline btn w-full" disabled={!selectedShape}>Send to Back</button>
	</div>
</div>
