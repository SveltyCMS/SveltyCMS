<!--
@file: src/components/image-editor/widgets/Annotate/Tool.svelte
@component
**Annotate Tool with interactive drawing support**

Allows users to add text, arrows, rectangles, and circles to images.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import AnnotateControls from './controls.svelte';

	type ToolType = 'text' | 'arrow' | 'rectangle' | 'circle' | null;

	interface Annotation {
		id: string;
		type: 'text' | 'arrow' | 'rect' | 'circle';
		x: number;
		y: number;
		x2?: number;
		y2?: number;
		width?: number;
		height?: number;
		radius?: number;
		text?: string;
		stroke: string;
		fill: string;
		strokeWidth: number;
		fontSize?: number;
	}

	let currentTool = $state<ToolType>(null);
	let strokeColor = $state('#ff0000');
	let fillColor = $state('transparent');
	let strokeWidth = $state(3);
	let textDraft = $state('Text');

	const storeState = imageEditorStore.state;

	// Ensure annotations is always an array
	const annotations = $derived(Array.isArray(storeState.annotations) ? storeState.annotations as Annotation[] : []);

	// Generate unique ID
	function generateId(): string {
		return `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	// Drawing state
	let isDrawing = $state(false);
	let startPoint = { x: 0, y: 0 };
	let currentPoint = { x: 0, y: 0 };
	let previewPoint = $state<{ x: number; y: number } | null>(null);
	let selectedAnnotationId = $state<string | null>(null);

	// Screen to image coordinates
	function screenToImage(screenX: number, screenY: number, width: number, height: number) {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return { x: 0, y: 0 };

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		return {
			x: (screenX - centerX) / zoom + imageElement.width / 2,
			y: (screenY - centerY) / zoom + imageElement.height / 2
		};
	}

	// Add text annotation
	function addTextAnnotation(x: number, y: number, text = textDraft.trim() || 'Text') {
		const newAnnotation: Annotation = {
			id: generateId(),
			type: 'text',
			x,
			y,
			text,
			stroke: strokeColor,
			fill: fillColor,
			strokeWidth,
			fontSize: 24
		};

		storeState.annotations = [...annotations, newAnnotation];
		selectedAnnotationId = newAnnotation.id;
		imageEditorStore.takeSnapshot();
		updateToolbar();
	}

	function updateSelectedTextAnnotation(text: string) {
		if (!selectedAnnotationId) {
			return;
		}

		storeState.annotations = annotations.map((ann) =>
			ann.id === selectedAnnotationId && ann.type === 'text' ? { ...ann, text: text || 'Text' } : ann
		);
	}

	function deleteSelectedAnnotation() {
		if (!selectedAnnotationId) {
			return;
		}

		const target = annotations.find((ann) => ann.id === selectedAnnotationId);
		storeState.annotations = annotations.filter((ann) => ann.id !== selectedAnnotationId);
		selectedAnnotationId = null;

		if (target?.type === 'text') {
			textDraft = 'Text';
		}

		imageEditorStore.takeSnapshot();
		updateToolbar();
	}

	function resetLocalState() {
		isDrawing = false;
		currentTool = null;
		textDraft = 'Text';
		previewPoint = null;
		selectedAnnotationId = null;
	}

	// Mouse event handlers
	export function handleMouseDown(e: MouseEvent, width: number, height: number) {
		const pos = screenToImage(e.offsetX, e.offsetY, width, height);
		previewPoint = pos;

		// Check if clicking on existing annotation
		for (const ann of annotations) {
			if (isPointInAnnotation(pos, ann)) {
				selectedAnnotationId = ann.id;
				if (ann.type === 'text') {
					textDraft = ann.text || 'Text';
				}
				updateToolbar();
				return;
			}
		}

		// Start new annotation
		if (currentTool) {
			if (currentTool === 'text') {
				addTextAnnotation(pos.x, pos.y);
				return;
			}

			isDrawing = true;
			startPoint = pos;
			currentPoint = pos;
			selectedAnnotationId = null;
		} else {
			selectedAnnotationId = null;
		}

		updateToolbar();
	}

	export function handleMouseMove(e: MouseEvent, width: number, height: number) {
		const pos = screenToImage(e.offsetX, e.offsetY, width, height);
		previewPoint = pos;
		if (!isDrawing) return;
		currentPoint = pos;
	}

	export function handleMouseUp(e: MouseEvent, width: number, height: number) {
		if (!isDrawing || !currentTool) {
			isDrawing = false;
			return;
		}

		const endPoint = screenToImage(e.offsetX, e.offsetY, width, height);

		// Create annotation based on tool
		let newAnnotation: Annotation | null = null;

		if (currentTool === 'arrow' || currentTool === 'rectangle' || currentTool === 'circle') {
			const minX = Math.min(startPoint.x, endPoint.x);
			const minY = Math.min(startPoint.y, endPoint.y);
			const maxX = Math.max(startPoint.x, endPoint.x);
			const maxY = Math.max(startPoint.y, endPoint.y);

			if (currentTool === 'arrow') {
				newAnnotation = {
					id: generateId(),
					type: 'arrow',
					x: startPoint.x,
					y: startPoint.y,
					x2: endPoint.x,
					y2: endPoint.y,
					stroke: strokeColor,
					fill: 'transparent',
					strokeWidth
				};
			} else if (currentTool === 'rectangle') {
				if (Math.abs(maxX - minX) < 5 || Math.abs(maxY - minY) < 5) {
					isDrawing = false;
					return;
				}
				newAnnotation = {
					id: generateId(),
					type: 'rect',
					x: minX,
					y: minY,
					width: maxX - minX,
					height: maxY - minY,
					stroke: strokeColor,
					fill: fillColor,
					strokeWidth
				};
			} else if (currentTool === 'circle') {
				const radius = Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2)) / 2;
				if (radius < 5) {
					isDrawing = false;
					return;
				}
				newAnnotation = {
					id: generateId(),
					type: 'circle',
					x: (minX + maxX) / 2,
					y: (minY + maxY) / 2,
					radius,
					stroke: strokeColor,
					fill: fillColor,
					strokeWidth
				};
			}
		}

		if (newAnnotation) {
			storeState.annotations = [...annotations, newAnnotation];
			selectedAnnotationId = newAnnotation.id;
			imageEditorStore.takeSnapshot();
		}

		isDrawing = false;
		updateToolbar();
	}

	// Check if point is inside annotation
	function isPointInAnnotation(point: { x: number; y: number }, ann: Annotation): boolean {
		const margin = 10;
		switch (ann.type) {
			case 'rect':
				return point.x >= ann.x! - margin && point.x <= ann.x! + ann.width! + margin && point.y >= ann.y! - margin && point.y <= ann.y! + ann.height! + margin;
			case 'circle':
				const dist = Math.sqrt(Math.pow(point.x - ann.x, 2) + Math.pow(point.y - ann.y, 2));
				return dist <= (ann.radius || 0) + margin;
			case 'text':
				return point.x >= ann.x - margin && point.x <= ann.x + (ann.text?.length || 0) * (ann.fontSize || 24) / 2 + margin && point.y >= ann.y - (ann.fontSize || 24) - margin && point.y <= ann.y + margin;
			case 'arrow':
				return Math.abs(point.x - ann.x!) < margin && Math.abs(point.y - ann.y!) < margin;
		}
		return false;
	}

	// Toolbar update
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'annotate') {
			updateToolbar();
		} else if (imageEditorStore.state.toolbarControls?.component === AnnotateControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	function updateToolbar() {
		imageEditorStore.setToolbarControls({
			component: AnnotateControls,
			props: {
				currentTool,
				strokeColor,
				fillColor,
				textDraft,
				onSetTool: (t: ToolType) => {
					currentTool = t;
					if (!t) {
						previewPoint = null;
					}
				},
				onStrokeColorChange: (v: string) => (strokeColor = v),
				onFillColorChange: (v: string) => (fillColor = v),
				onTextDraftChange: (v: string) => {
					textDraft = v;
					updateSelectedTextAnnotation(v);
				},
				hasSelection: !!selectedAnnotationId,
				onDeleteAnnotation: deleteSelectedAnnotation,
				onAddText: () => {
					if (currentTool === 'text') {
						const img = storeState.imageElement;
						if (!img) return;
						addTextAnnotation(img.width / 2, img.height / 2);
					}
				}
			}
		});
	}

	// Render function
	const renderAnnotations = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return;

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;

		// Draw all annotations
		for (const ann of annotations) {
			const isSelected = ann.id === selectedAnnotationId;
			context.strokeStyle = ann.stroke;
			context.fillStyle = ann.fill;
			context.lineWidth = ann.strokeWidth / zoom;
			context.lineCap = 'round';
			context.lineJoin = 'round';

			switch (ann.type) {
				case 'rect':
					context.strokeRect(ann.x! + offsetX, ann.y! + offsetY, ann.width!, ann.height!);
					if (ann.fill !== 'transparent') {
						context.fillRect(ann.x! + offsetX, ann.y! + offsetY, ann.width!, ann.height!);
					}
					break;

				case 'circle':
					context.beginPath();
					context.arc(ann.x + offsetX, ann.y + offsetY, ann.radius!, 0, Math.PI * 2);
					context.stroke();
					if (ann.fill !== 'transparent') {
						context.fill();
					}
					break;

				case 'text':
					context.font = `${ann.fontSize}px Arial`;
					context.fillStyle = ann.stroke;
					context.fillText(ann.text || '', ann.x + offsetX, ann.y + offsetY);
					break;

				case 'arrow':
					if (ann.x2 !== undefined && ann.y2 !== undefined) {
						const ax = ann.x + offsetX;
						const ay = ann.y + offsetY;
						const ax2 = ann.x2 + offsetX;
						const ay2 = ann.y + offsetY;

						// Draw line
						context.beginPath();
						context.moveTo(ax, ay);
						context.lineTo(ax2, ay2);
						context.stroke();

						// Draw arrowhead
						const angle = Math.atan2(ay2 - ay, ax2 - ax);
						const headLength = 15;
						context.beginPath();
						context.moveTo(ax2, ay2);
						context.lineTo(ax2 - headLength * Math.cos(angle - Math.PI / 6), ay2 - headLength * Math.sin(angle - Math.PI / 6));
						context.moveTo(ax2, ay2);
						context.lineTo(ax2 - headLength * Math.cos(angle + Math.PI / 6), ay2 - headLength * Math.sin(angle + Math.PI / 6));
						context.stroke();
					}
					break;
			}

			// Selection indicator
			if (isSelected) {
				context.setLineDash([5 / zoom, 5 / zoom]);
				context.strokeStyle = '#3b82f6';
				context.lineWidth = 2 / zoom;
				if (ann.type === 'rect') {
					context.strokeRect(ann.x! + offsetX - 5, ann.y! + offsetY - 5, ann.width! + 10, ann.height! + 10);
				} else if (ann.type === 'circle') {
					context.beginPath();
					context.arc(ann.x + offsetX, ann.y + offsetY, ann.radius! + 5, 0, Math.PI * 2);
					context.stroke();
				} else if (ann.type === 'text') {
					context.font = `${ann.fontSize}px Arial`;
					const metrics = context.measureText(ann.text || '');
					const textHeight = ann.fontSize || 24;
					context.strokeRect(
						ann.x + offsetX - 6,
						ann.y + offsetY - 6,
						Math.max(12, metrics.width + 12),
						textHeight + 12
					);
				} else if (ann.type === 'arrow' && ann.x2 !== undefined && ann.y2 !== undefined) {
					const minX = Math.min(ann.x, ann.x2) + offsetX - 8;
					const minY = Math.min(ann.y, ann.y2) + offsetY - 8;
					const width = Math.abs(ann.x2 - ann.x) + 16;
					const height = Math.abs(ann.y2 - ann.y) + 16;
					context.strokeRect(minX, minY, width, height);
				}
				context.setLineDash([]);
			}
		}

		// Draw current shape being drawn
		if (isDrawing && currentTool && currentTool !== 'text') {
			context.strokeStyle = strokeColor;
			context.fillStyle = fillColor;
			context.lineWidth = strokeWidth / zoom;
			context.setLineDash([5 / zoom, 5 / zoom]);

			const sx = startPoint.x + offsetX;
			const sy = startPoint.y + offsetY;
			const ex = currentPoint.x + offsetX;
			const ey = currentPoint.y + offsetY;

			if (currentTool === 'arrow') {
				context.beginPath();
				context.moveTo(sx, sy);
				context.lineTo(ex, ey);
				context.stroke();
			} else if (currentTool === 'rectangle') {
				context.strokeRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
			} else if (currentTool === 'circle') {
				const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2)) / 2;
				const cx = (sx + ex) / 2;
				const cy = (sy + ey) / 2;
				context.beginPath();
				context.arc(cx, cy, radius, 0, Math.PI * 2);
				context.stroke();
			}

			context.setLineDash([]);
		}

		if (currentTool === 'text' && previewPoint && textDraft.trim()) {
			context.save();
			context.globalAlpha = 0.45;
			context.font = `24px Arial`;
			context.fillStyle = strokeColor;
			context.textBaseline = 'top';
			context.fillText(textDraft.trim(), previewPoint.x + offsetX, previewPoint.y + offsetY);
			context.restore();
		}

		context.restore();
	};

	export function saveState() {
		return annotations;
	}

	export function beforeExit() {
		resetLocalState();
		imageEditorStore.setToolbarControls(null);
	}
</script>

<Layer render={renderAnnotations} />
