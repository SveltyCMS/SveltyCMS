<!--
@file: src/routes/(app)/imageEditor/components/Annotate.svelte
@component
**Annotation tool for adding text and shapes to images**
Allows users to add text labels, arrows, rectangles, circles, and other shapes
with customizable colors, sizes, and styles.

#### Props
- `stage`: Konva Stage instance
- `layer`: Konva Layer instance
- `imageNode`: Konva Image node
- `onAnnotationChange`: Callback when annotations are added/modified
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount, onDestroy } from 'svelte';

	// Props
	let {
		stage = $bindable(),
		layer = $bindable(),
		imageNode = $bindable(),
		onAnnotationChange = () => {}
	}: {
		stage: Konva.Stage | null;
		layer: Konva.Layer | null;
		imageNode: Konva.Image | null;
		onAnnotationChange?: () => void;
	} = $props();

	// Annotation state
	let annotations: any[] = $state([]);
	let selectedAnnotation: any = $state(null);
	let transformer: Konva.Transformer | null = $state(null);
	let currentTool: 'text' | 'rectangle' | 'circle' | 'arrow' | 'line' | null = $state(null);

	// Drawing state for shapes
	let isDrawing = $state(false);
	let currentShape: any = null;
	let startPos: { x: number; y: number } | null = null;

	// Style settings
	let strokeColor = $state('#ff0000');
	let fillColor = $state('transparent');
	let strokeWidth = $state(2);
	let fontSize = $state(20);
	let fontFamily = $state('Arial');

	/**
	 * Initialize the annotation tool
	 */
	function initialize() {
		if (!stage || !layer) return;

		// Create transformer for selected annotations
		transformer = new Konva.Transformer({
			name: 'annotationTransformer',
			keepRatio: false,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'],
			boundBoxFunc: (oldBox, newBox) => {
				// Limit resize
				if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
					return oldBox;
				}
				return newBox;
			}
		});
		layer.add(transformer);

		// Add stage click handler to deselect
		stage.on('click', handleStageClick);

		layer.batchDraw();
	}

	/**
	 * Add text annotation
	 */
	function addText(x: number, y: number, text: string = 'Double click to edit') {
		if (!layer) return;

		const textNode = new Konva.Text({
			x,
			y,
			text,
			fontSize,
			fontFamily,
			fill: strokeColor,
			draggable: true,
			name: 'annotation-text'
		});

		// Double click to edit
		textNode.on('dblclick dbltap', () => {
			editText(textNode);
		});

		// Click to select
		textNode.on('click tap', (e) => {
			e.cancelBubble = true;
			selectAnnotation(textNode);
		});

		layer.add(textNode);
		annotations.push(textNode);
		layer.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Edit text annotation
	 */
	function editText(textNode: Konva.Text) {
		if (!stage) return;

		// Create textarea for editing
		const textPosition = textNode.absolutePosition();
		const stageBox = stage.container().getBoundingClientRect();

		const textarea = document.createElement('textarea');
		document.body.appendChild(textarea);

		textarea.value = textNode.text();
		textarea.style.position = 'absolute';
		textarea.style.top = `${stageBox.top + textPosition.y}px`;
		textarea.style.left = `${stageBox.left + textPosition.x}px`;
		textarea.style.width = `${textNode.width()}px`;
		textarea.style.fontSize = `${textNode.fontSize()}px`;
		textarea.style.fontFamily = textNode.fontFamily();
		textarea.style.border = '1px solid #000';
		textarea.style.padding = '0px';
		textarea.style.margin = '0px';
		textarea.style.overflow = 'hidden';
		textarea.style.background = 'none';
		textarea.style.outline = 'none';
		textarea.style.resize = 'none';
		textarea.style.color = textNode.fill();
		textarea.style.zIndex = '1000';

		textarea.focus();

		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				textNode.text(textarea.value);
				document.body.removeChild(textarea);
				layer?.batchDraw();
				onAnnotationChange();
			}
		});

		textarea.addEventListener('blur', () => {
			textNode.text(textarea.value);
			document.body.removeChild(textarea);
			layer?.batchDraw();
			onAnnotationChange();
		});
	}

	/**
	 * Add rectangle annotation
	 */
	function addRectangle(x: number, y: number, width: number, height: number) {
		if (!layer) return;

		const rect = new Konva.Rect({
			x,
			y,
			width,
			height,
			stroke: strokeColor,
			strokeWidth,
			fill: fillColor,
			draggable: true,
			name: 'annotation-rect'
		});

		rect.on('click tap', (e) => {
			e.cancelBubble = true;
			selectAnnotation(rect);
		});

		layer.add(rect);
		annotations.push(rect);
		layer.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Add circle annotation
	 */
	function addCircle(x: number, y: number, radius: number) {
		if (!layer) return;

		const circle = new Konva.Circle({
			x,
			y,
			radius,
			stroke: strokeColor,
			strokeWidth,
			fill: fillColor,
			draggable: true,
			name: 'annotation-circle'
		});

		circle.on('click tap', (e) => {
			e.cancelBubble = true;
			selectAnnotation(circle);
		});

		layer.add(circle);
		annotations.push(circle);
		layer.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Add arrow annotation
	 */
	function addArrow(points: number[]) {
		if (!layer) return;

		const arrow = new Konva.Arrow({
			points,
			stroke: strokeColor,
			strokeWidth,
			fill: strokeColor,
			draggable: true,
			name: 'annotation-arrow',
			pointerLength: 10,
			pointerWidth: 10
		});

		arrow.on('click tap', (e) => {
			e.cancelBubble = true;
			selectAnnotation(arrow);
		});

		layer.add(arrow);
		annotations.push(arrow);
		layer.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Add line annotation
	 */
	function addLine(points: number[]) {
		if (!layer) return;

		const line = new Konva.Line({
			points,
			stroke: strokeColor,
			strokeWidth,
			draggable: true,
			name: 'annotation-line'
		});

		line.on('click tap', (e) => {
			e.cancelBubble = true;
			selectAnnotation(line);
		});

		layer.add(line);
		annotations.push(line);
		layer.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Select annotation
	 */
	function selectAnnotation(node: any) {
		if (!transformer) return;

		selectedAnnotation = node;
		transformer.nodes([node]);
		layer?.batchDraw();
	}

	/**
	 * Delete selected annotation
	 */
	function deleteSelected() {
		if (!selectedAnnotation) return;

		selectedAnnotation.destroy();
		annotations = annotations.filter((a) => a !== selectedAnnotation);
		selectedAnnotation = null;
		transformer?.nodes([]);
		layer?.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Delete all annotations
	 */
	function deleteAll() {
		annotations.forEach((annotation) => annotation.destroy());
		annotations = [];
		selectedAnnotation = null;
		transformer?.nodes([]);
		layer?.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Handle stage click to deselect
	 */
	function handleStageClick(e: any) {
		// Clicked on stage - deselect
		if (e.target === stage) {
			selectedAnnotation = null;
			transformer?.nodes([]);
			layer?.batchDraw();
		}
	}

	/**
	 * Start drawing shape
	 */
	function handleMouseDown(e: any) {
		if (!currentTool || !stage) return;

		const pos = stage.getPointerPosition();
		if (!pos) return;

		isDrawing = true;
		startPos = pos;

		if (currentTool === 'text') {
			addText(pos.x, pos.y);
			isDrawing = false;
			currentTool = null;
			return;
		}

		// For shapes, create temporary shape
		switch (currentTool) {
			case 'rectangle':
				currentShape = new Konva.Rect({
					x: pos.x,
					y: pos.y,
					width: 0,
					height: 0,
					stroke: strokeColor,
					strokeWidth,
					fill: fillColor
				});
				break;
			case 'circle':
				currentShape = new Konva.Circle({
					x: pos.x,
					y: pos.y,
					radius: 0,
					stroke: strokeColor,
					strokeWidth,
					fill: fillColor
				});
				break;
			case 'arrow':
				currentShape = new Konva.Arrow({
					points: [pos.x, pos.y, pos.x, pos.y],
					stroke: strokeColor,
					strokeWidth,
					fill: strokeColor,
					pointerLength: 10,
					pointerWidth: 10
				});
				break;
			case 'line':
				currentShape = new Konva.Line({
					points: [pos.x, pos.y, pos.x, pos.y],
					stroke: strokeColor,
					strokeWidth
				});
				break;
		}

		if (currentShape) {
			currentShape.name('temp-shape');
			layer?.add(currentShape);
		}
	}

	/**
	 * Continue drawing shape
	 */
	function handleMouseMove(e: any) {
		if (!isDrawing || !currentShape || !startPos || !stage) return;

		const pos = stage.getPointerPosition();
		if (!pos) return;

		switch (currentTool) {
			case 'rectangle':
				currentShape.width(pos.x - startPos.x);
				currentShape.height(pos.y - startPos.y);
				break;
			case 'circle':
				const radius = Math.sqrt(Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2));
				currentShape.radius(radius);
				break;
			case 'arrow':
			case 'line':
				currentShape.points([startPos.x, startPos.y, pos.x, pos.y]);
				break;
		}

		layer?.batchDraw();
	}

	/**
	 * Finish drawing shape
	 */
	function handleMouseUp() {
		if (!isDrawing || !currentShape) return;

		isDrawing = false;
		currentShape.name(`annotation-${currentTool}`);
		currentShape.draggable(true);

		// Add click handler
		currentShape.on('click tap', (e: any) => {
			e.cancelBubble = true;
			selectAnnotation(currentShape);
		});

		annotations.push(currentShape);
		currentShape = null;
		currentTool = null;
		startPos = null;
		layer?.batchDraw();
		onAnnotationChange();
	}

	/**
	 * Set current drawing tool
	 */
	function setTool(tool: typeof currentTool) {
		currentTool = tool;
	}

	/**
	 * Cleanup on unmount
	 */
	function cleanup() {
		if (!stage || !layer) return;

		// Remove transformer
		transformer?.destroy();

		// Remove all annotations
		annotations.forEach((annotation) => annotation.destroy());

		// Remove event listeners
		stage.off('click');
		stage.off('mousedown');
		stage.off('mousemove');
		stage.off('mouseup');

		layer.batchDraw();
	}

	// Setup when component mounts
	onMount(() => {
		console.log('[Annotate] Component mounted', { stage, layer, imageNode });
		initialize();

		// Add drawing handlers
		if (stage) {
			stage.on('mousedown touchstart', handleMouseDown);
			stage.on('mousemove touchmove', handleMouseMove);
			stage.on('mouseup touchend', handleMouseUp);
		}
		console.log('[Annotate] Initialization complete');
	});

	// Cleanup on unmount
	onDestroy(cleanup);

	// Export methods for parent component
	export function apply() {
		return annotations;
	}

	export function reset() {
		deleteAll();
	}

	export function getAnnotations() {
		return annotations;
	}

	export { setTool, deleteSelected, deleteAll, selectAnnotation };
	export { currentTool, strokeColor, fillColor, strokeWidth, fontSize, fontFamily };
</script>
