<!-- 
@file /src/routes/(app)/imageEditor/ShapeOverlay.svelte
@component
**This component allows users to overlay shapes (rectangles, circles, ellipses) onto an image**
Users can adjust the fill color, stroke color, stroke width, opacity, and manage the shape's position on the canvas

#### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed.
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `on:exitShapeOverlay` (optional): Function to be called when the shape overlay is exited.
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		onExitShapeOverlay?: () => void;
	}

	const { stage, layer, onExitShapeOverlay = () => {} } = $props() as Props;

	let shapeType = $state('rectangle');
	let fillColor: string = $state('#ffffff');
	let strokeColor: string = $state('#000000');
	let strokeWidth = $state(2);
	let opacity = $state(1);

	let shapes = $state<Konva.Shape[]>([]);
	let selectedShape: Konva.Shape | null = $state(null);

	// Initialize stage event listeners
	$effect.root(() => {
		stage.on('click tap', (e) => {
			if (e.target === stage) {
				selectShape(null);
			}
		});

		// Cleanup function
		return () => {
			stage.off('click tap');
		};
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
		onExitShapeOverlay();
	}
</script>

<!-- Shape Overlay Controls UI -->
<div class="wrapper">
	<div class="flex w-full items-center justify-between">
		<div class="flex items-center gap-2">
			<!-- Back button at top of component -->
			<button onclick={exitShapeOverlay} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
				<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
			</button>

			<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Shape Overlay Settings</h3>
		</div>

		<!-- Action Buttons -->
		<div class="mt-4 flex justify-around gap-4">
			<button onclick={resetFocalPoint} class="variant-filled-primary btn" aria-label="Reset focal point to center"> Reset Focal Point </button>
		</div>
	</div>

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
				<input type="color" bind:value={fillColor} oninput={updateSelectedShape} class="input" />
			</label>

			<label class="flex flex-col">
				<span class="mb-1">Stroke Color:</span>
				<input type="color" bind:value={strokeColor} oninput={updateSelectedShape} class="input" />
			</label>
		</div>

		<label class="flex flex-col">
			<span class="mb-1">Stroke Width: {strokeWidth}px</span>
			<input type="range" min="0" max="20" step="1" bind:value={strokeWidth} oninput={updateSelectedShape} class="input" />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Opacity: {opacity.toFixed(2)}</span>
			<input type="range" min="0" max="1" step="0.01" bind:value={opacity} oninput={updateSelectedShape} class=" input" />
		</label>
	</div>

	<div class="mt-4 flex justify-between space-x-2">
		<button onclick={addShape} class="variant-filled-primary btn w-full">Add Shape</button>
		<button onclick={deleteSelectedShape} class="variant-filled-error btn w-full" disabled={!selectedShape}>Delete</button>
		<button onclick={bringToFront} class="variant-outline btn w-full" disabled={!selectedShape}>Bring to Front</button>
		<button onclick={sendToBack} class="variant-outline btn w-full" disabled={!selectedShape}>Send to Back</button>
	</div>
</div>
