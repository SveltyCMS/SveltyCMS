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
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	// Props
	let {
		stage = $bindable(),
		layer = $bindable(),
		imageNode = $bindable(),
		onAnnotationChange = () => {},
		strokeColor = $bindable('#ff0000'),
		fillColor = $bindable('transparent'),
		strokeWidth = $bindable(2),
		fontSize = $bindable(20)
	}: {
		stage: Konva.Stage | null;
		layer: Konva.Layer | null;
		imageNode: Konva.Image | null;
		onAnnotationChange?: () => void;
		strokeColor?: string;
		fillColor?: string;
		strokeWidth?: number;
		fontSize?: number;
	} = $props();

	// Types
	type AnnotationShape = Konva.Rect | Konva.Circle | Konva.Arrow | Konva.Line | Konva.Text;

	// Annotation state
	let annotations: AnnotationShape[] = $state([]);
	let selectedAnnotation: AnnotationShape | null = $state(null);
	let transformer: Konva.Transformer | null = $state(null);
	let currentTool: 'text' | 'rectangle' | 'circle' | 'arrow' | 'line' | null = $state(null);

	// Drawing state for shapes
	let isDrawing = $state(false);
	let currentShape: AnnotationShape | null = null;
	let startPos: { x: number; y: number } | null = null;

	// Style settings (now using props)
	let fontFamily = $state('Arial');

	/**
	 * Activate the annotation tool, adding event listeners.
	 */
	function activate() {
		if (!stage) return;
		console.log('Activating annotation tool listeners');
		stage.on('mousedown.annotate touchstart.annotate', handleMouseDown);
		stage.on('mousemove.annotate touchmove.annotate', handleMouseMove);
		stage.on('mouseup.annotate touchend.annotate', handleMouseUp);
		stage.on('click.annotate tap.annotate', handleStageClick);
	}

	/**
	 * Deactivate the annotation tool, removing event listeners.
	 */
	function deactivate() {
		if (!stage) return;
		console.log('Deactivating annotation tool listeners');
		stage.off('mousedown.annotate touchstart.annotate');
		stage.off('mousemove.annotate touchmove.annotate');
		stage.off('mouseup.annotate touchend.annotate');
		stage.off('click.annotate tap.annotate');
	}

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
			rotateEnabled: true,
			borderStroke: '#0066ff',
			borderStrokeWidth: 2,
			anchorFill: '#0066ff',
			anchorStroke: '#ffffff',
			anchorSize: 10,
			anchorCornerRadius: 2,
			boundBoxFunc: (oldBox, newBox) => {
				// Limit resize
				if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
					return oldBox;
				}
				return newBox;
			}
		});
		layer.add(transformer);
		transformer.moveToTop();

		// Do not add stage click handler here, will be managed by activate/deactivate

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
		const fillColor = textNode.fill();
		textarea.style.color = typeof fillColor === 'string' ? fillColor : '#000000';
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
	 * Select annotation
	 */
	function selectAnnotation(node: AnnotationShape) {
		if (!transformer || !layer || !stage) return;

		// Check if node is still attached to the layer
		if (!node || !node.getParent()) return;

		selectedAnnotation = node;
		transformer.nodes([node]);
		transformer.show();
		transformer.moveToTop();
		layer.batchDraw();
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
	function handleStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
		if (!stage || !transformer) return;

		// If we are drawing, don't deselect.
		if (isDrawing) return;

		// Deselect if clicked on anything that's not an annotation
		// Check if the target is an annotation by checking its name
		const targetName = e.target.name();
		const isAnnotation = targetName && (targetName.startsWith('annotation-') || targetName === 'annotationTransformer');

		if (!isAnnotation) {
			selectedAnnotation = null;
			transformer.nodes([]);
			transformer.hide();
			layer?.batchDraw();
		}
	}

	/**
	 * Start drawing shape
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function handleMouseDown(_e: Konva.KonvaEventObject<MouseEvent>) {
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function handleMouseMove(_e: Konva.KonvaEventObject<MouseEvent>) {
		if (!isDrawing || !currentShape || !startPos || !stage) return;

		const pos = stage.getPointerPosition();
		if (!pos) return;

		switch (currentTool) {
			case 'rectangle': {
				currentShape.width(pos.x - startPos.x);
				currentShape.height(pos.y - startPos.y);
				break;
			}
			case 'circle': {
				const radius = Math.sqrt(Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2));
				(currentShape as Konva.Circle).radius(radius);
				break;
			}
			case 'arrow':
			case 'line':
				(currentShape as Konva.Arrow | Konva.Line).points([startPos.x, startPos.y, pos.x, pos.y]);
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
		const shape = currentShape; // Capture in local variable for the click handler
		shape.name(`annotation-${currentTool}`);
		shape.draggable(true);

		// Add click handler
		shape.on('click tap', (e: Konva.KonvaEventObject<MouseEvent>) => {
			e.cancelBubble = true;
			selectAnnotation(shape);
		});

		annotations.push(shape);
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
		transformer = null;

		// Remove all annotations
		annotations.forEach((annotation) => annotation.destroy());
		annotations = [];
		selectedAnnotation = null;

		// Remove event listeners with specific handlers
		deactivate();

		layer.batchDraw();
	}

	// Setup when component mounts
	onMount(() => {
		initialize();
	});

	// Cleanup on unmount
	onDestroy(cleanup);

	// Effect to react to active tool state from the store
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'annotate') {
			activate();
		} else {
			deactivate();
		}
	});

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
</script>
