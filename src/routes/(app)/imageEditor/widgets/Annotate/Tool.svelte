<!--
@file: src/routes/(app)/imageEditor/widgets/Annotate/Tool.svelte
@component
**Annotate Tool "Controller"**

Orchestrates the annotation lifecycle:
- Manages the $state list of AnnotationItem instances
- Handles stage drawing events (mousedown, mousemove, mouseup)
- Manages the active selection and transformer
- Registers the toolbar UI
- Implements the critical 'apply' (bake) logic
-->

<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import AnnotateControls from './Controls.svelte';
	import { AnnotationItem, type AnnotationKind } from './regions';
	import * as draw from './draw';
	import { createTransformer, attachTransformer } from './transformer';
	import { enableTextEdit } from './editText';
	import { names } from './events';

	// --- Svelte 5 State ---
	let transformer: Konva.Transformer | null = $state(null);
	let annotations: AnnotationItem[] = $state([]);
	let selected: AnnotationItem | null = $state(null);
	let currentTool: AnnotationKind | null = $state(null);
	let strokeColor = $state('#ff0000');
	let fillColor = $state('transparent');
	let strokeWidth = $state(2);
	let fontSize = $state(20);

	// Drawing state machine
	let isDrawing = $state(false);
	let tempNode: Konva.Node | null = $state(null);
	let startPos: { x: number; y: number } | null = $state(null);

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	// Svelte 5: use callback props via $props
	const props = $props();

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'annotate') {
			bindTool();
			imageEditorStore.setToolbarControls({
				component: AnnotateControls,
				props: {
					get currentTool() {
						return currentTool;
					},
					get strokeColor() {
						return strokeColor;
					},
					get fillColor() {
						return fillColor;
					},
					get strokeWidth() {
						return strokeWidth;
					},
					get fontSize() {
						return fontSize;
					},
					onSetTool: (t: AnnotationKind) => {
						currentTool = t;
						deselect(); // Deselect to allow drawing
					},
					onStrokeColorChange: (v: string) => {
						strokeColor = v;
						selected?.node.setAttrs({ stroke: v, fill: v });
					},
					onFillColorChange: (v: string) => {
						fillColor = v;
						selected?.node.setAttrs({ fill: v });
					},
					onStrokeWidthChange: (v: number) => {
						strokeWidth = v;
						selected?.node.setAttrs({ strokeWidth: v });
					},
					onFontSizeChange: (v: number) => {
						fontSize = v;
						selected?.node.setAttrs({ fontSize: v });
					},
					onDelete: () => deleteSelected(),
					onDeleteAll: () => reset(),
					onDone: () => apply()
				}
			});
		} else {
			unbindTool();
			if (imageEditorStore.state.toolbarControls?.component === AnnotateControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// --- Event Binding ---
	function bindTool() {
		const { stage, layer } = imageEditorStore.state;
		if (!stage || !layer || _toolBound) return;
		_toolBound = true;

		if (!transformer) {
			transformer = createTransformer(layer);
		}
		stage.on(names('mousedown'), onMouseDown);
		stage.on(names('mousemove'), onMouseMove);
		stage.on(names('mouseup'), onMouseUp);
		stage.on(names('click'), onStageClick);
		stage.on(names('dblclick'), onDblClick);
		stage.container().style.cursor = 'crosshair';
	}

	function unbindTool() {
		const { stage } = imageEditorStore.state;
		if (!stage || !_toolBound) return;
		_toolBound = false;

		stage.off(names('mousedown'));
		stage.off(names('mousemove'));
		stage.off(names('mouseup'));
		stage.off(names('click'));
		stage.off(names('dblclick'));
		if (stage.container()) stage.container().style.cursor = 'default';
		deselect();
		currentTool = null;
		isDrawing = false;
		tempNode = null;
	}

	// --- Drawing Handlers ---
	function onMouseDown(e: Konva.KonvaEventObject) {
		// Don't draw if clicking on existing node
		if (e.target !== e.target.getStage()) return;

		const { stage, layer } = imageEditorStore.state;
		if (!stage || !layer) return;
		const pos = stage.getPointerPosition();
		if (!pos) return;
		if (!currentTool) return;

		deselect();
		isDrawing = true;
		startPos = pos;

		switch (currentTool) {
			case 'text': {
				const txt = draw.createText(layer, pos.x, pos.y, 'Text', fontSize, strokeColor);
				const item = finalizeNode(txt, 'text');
				select(item);
				isDrawing = false; // Text is one-click
				currentTool = null; // Exit tool
				startTextEdit(item.node as Konva.Text); // Immediately edit
				break;
			}
			case 'rect':
				tempNode = draw.createRect(layer, pos.x, pos.y, 0, 0, strokeColor, fillColor, strokeWidth);
				break;
			case 'circle':
				tempNode = draw.createCircle(layer, pos.x, pos.y, 0, strokeColor, fillColor, strokeWidth);
				break;
			case 'line':
				tempNode = draw.createLine(layer, [pos.x, pos.y, pos.x, pos.y], strokeColor, strokeWidth);
				break;
			case 'arrow':
				tempNode = draw.createArrow(layer, [pos.x, pos.y, pos.x, pos.y], strokeColor, strokeWidth);
				break;
		}
	}

	function onMouseMove() {
		if (!isDrawing || !tempNode || !startPos) return;
		const { stage, layer } = imageEditorStore.state;
		if (!stage || !layer) return;
		const pos = stage.getPointerPosition();
		if (!pos) return;

		if (tempNode instanceof Konva.Rect) {
			tempNode.width(pos.x - startPos.x);
			tempNode.height(pos.y - startPos.y);
		} else if (tempNode instanceof Konva.Circle) {
			const r = Math.hypot(pos.x - startPos.x, pos.y - startPos.y);
			tempNode.radius(r);
		} else if (tempNode instanceof Konva.Line || tempNode instanceof Konva.Arrow) {
			(tempNode as Konva.Line).points([startPos.x, startPos.y, pos.x, pos.y]);
		}
		layer.batchDraw();
	}

	function onMouseUp() {
		if (!isDrawing || !tempNode || !currentTool) return;
		isDrawing = false;

		// Finalize node
		const item = finalizeNode(tempNode, currentTool);
		select(item);

		tempNode = null;
		currentTool = null;
		startPos = null;
		imageEditorStore.state.layer?.batchDraw();
	}

	function onStageClick(e: Konva.KonvaEventObject) {
		if (isDrawing || currentTool) return;
		// Deselect if clicking on stage background
		if (e.target === e.target.getStage()) {
			deselect();
		}
	}

	function onDblClick(e: Konva.KonvaEventObject) {
		const node = e.target;
		if (node instanceof Konva.Text) {
			const item = annotations.find((a) => a.node === node);
			if (item) {
				select(item);
				startTextEdit(item.node as Konva.Text);
			}
		}
	}

	// --- Helper Functions ---
	function finalizeNode(node: Konva.Node, kind: AnnotationKind): AnnotationItem {
		const { layer } = imageEditorStore.state;
		if (!layer) throw new Error('No layer');
		node.name(`annotation-${kind}`);
		node.draggable(true);
		const item = new AnnotationItem(crypto.randomUUID(), node, layer, kind);
		item.onSelect(() => select(item));
		annotations = [...annotations, item];
		return item;
	}

	function startTextEdit(textNode: Konva.Text) {
		const { stage } = imageEditorStore.state;
		if (!stage) return;
		textNode.hide();
		transformer?.hide();
		enableTextEdit(stage, textNode, (newValue) => {
			textNode.text(newValue);
			textNode.show();
			transformer?.show();
			transformer?.forceUpdate();
			imageEditorStore.state.layer?.batchDraw();
		});
	}

	function select(item: AnnotationItem) {
		selected = item;
		if (!transformer) return;
		attachTransformer(transformer, item.node);
	}

	function deselect() {
		selected = null;
		if (!transformer) return;
		attachTransformer(transformer, null);
	}

	function deleteSelected() {
		if (!selected) return;
		const id = selected.id;
		selected.destroy();
		annotations = annotations.filter((a) => a.id !== id);
		selected = null;
		deselect(); // Hides transformer
	}

	function reset() {
		annotations.forEach((a) => a.destroy());
		annotations = [];
		selected = null;
		deselect();
		props.onAnnotateReset?.(); // Callback for snapshot
	}

	function cleanupAnnotations(destroy = true) {
		deselect();
		isDrawing = false;
		currentTool = null;
		tempNode = null;
		if (destroy) {
			[...annotations].forEach((a) => a.destroy());
			annotations = [];
		} else {
			// Hide UI for baking
			annotations.forEach((a) => a.disableInteraction());
		}
		imageEditorStore.state.layer?.batchDraw();
	}

	// --- Tool Actions ---

	/**
	 * ** FIX: This is the correct "bake" apply **
	 * It follows the same robust logic as the Blur/Crop tools.
	 */
	async function apply() {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		// 1. Hide all UI (transformer, etc.)
		cleanupAnnotations(false); // false = don't destroy, just hide

		// 2. Capture the entire stage (with annotations)
		const dataURL = stage.toDataURL({ pixelRatio: 1 });

		// 3. Load the baked image
		const newImage = new Image();
		await new Promise((res) => {
			newImage.onload = () => res();
			newImage.src = dataURL;
		});

		// 4. Update the main imageNode
		imageNode.image(newImage);

		// 5. Reset all transforms (they are now baked in)
		imageNode.width(newImage.width);
		imageNode.height(newImage.height);
		imageNode.x(-newImage.width / 2);
		imageNode.y(-newImage.height / 2);
		imageNode.filters([]);
		imageNode.cache();

		imageGroup.scale({ x: 1, y: 1 });
		imageGroup.rotation(0);

		// 6. Fully destroy all annotation instances
		cleanupAnnotations(true);

		// 7. Re-center the 1:1 group
		centerImageInStage();

		// 8. Finalize
		layer.batchDraw();
		props.onAnnotateApplied?.(); // Callback for snapshot
		imageEditorStore.setActiveState('');
	}

	function centerImageInStage() {
		const { stage, imageGroup } = imageEditorStore.state;
		if (!stage || !imageGroup) return;
		imageGroup.position({ x: stage.width() / 2, y: stage.height() / 2 });
		stage.batchDraw();
	}

	// --- Parent Store API ---
	export function cleanup() {
		try {
			unbindTool();
			cleanupAnnotations(true);
			transformer?.destroy();
			transformer = null;
		} catch (e) {
			/* ignore */
		}
	}
	export function saveState() {}
	export function beforeExit() {
		cleanup();
	}
</script>

<!-- Controls registered to master toolbar; no DOM toolbar here -->
