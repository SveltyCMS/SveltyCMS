<!--
@file: src/components/imageEditor/widgets/Annotate/Tool.svelte
@component
**Annotate Tool "Controller"**

Orchestrates annotations using svelte-canvas compatible state and rendering.
-->

<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import { Layer } from 'svelte-canvas';
	import AnnotateControls from './Controls.svelte';

	// --- Svelte 5 State ---
	let currentTool = $state<any>(null);
	let strokeColor = $state('#ff0000');
	let fillColor = $state('transparent');

	let { onCancel }: { onCancel: () => void } = $props();
	const storeState = imageEditorStore.state;

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'annotate') {
			imageEditorStore.setToolbarControls({
				component: AnnotateControls,
				props: {
					currentTool,
					strokeColor,
					fillColor,
					onSetTool: (t: any) => (currentTool = t),
					onStrokeColorChange: (v: string) => (strokeColor = v),
					onFillColorChange: (v: string) => (fillColor = v),
					onDelete: deleteSelected,
					onCancel: () => onCancel(),
					onApply: apply
				}
			});
		} else if (imageEditorStore.state.toolbarControls?.component === AnnotateControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	function deleteSelected() {
		// Implementation for deleting selected annotation
	}

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	const renderAnnotations = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { annotations, zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return;

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;

		for (const ann of annotations) {
			context.strokeStyle = ann.stroke;
			context.fillStyle = ann.fill;
			context.lineWidth = (ann.strokeWidth || 2) / zoom;

			if (ann.type === 'rect') {
				context.strokeRect(ann.x + offsetX, ann.y + offsetY, ann.width, ann.height);
				if (ann.fill !== 'transparent') {
					context.fillRect(ann.x + offsetX, ann.y + offsetY, ann.width, ann.height);
				}
			} else if (ann.type === 'circle') {
				context.beginPath();
				context.arc(ann.x + offsetX, ann.y + offsetY, ann.radius, 0, Math.PI * 2);
				context.stroke();
				if (ann.fill !== 'transparent') context.fill();
			} else if (ann.type === 'text') {
				context.font = `${ann.fontSize}px Arial`;
				context.fillText(ann.text, ann.x + offsetX, ann.y + offsetY);
			}
		}

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {}
</script>

<Layer render={renderAnnotations} />
