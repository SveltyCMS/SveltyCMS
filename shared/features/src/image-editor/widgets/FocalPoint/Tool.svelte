<!--
@file shared/features/src/image-editor/widgets/FocalPoint/Tool.svelte
@component
**FocalPoint Tool**

Allows users to set the focal point of an image with rule of thirds grid overlay.
- Displays rule of thirds grid
- Click to set focal point
- Shows crosshair at focal point
- Updates toolbar with X/Y coordinates
-->

<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@shared/stores/imageEditorStore.svelte';
	import FocalPointControls from './Controls.svelte';

	// --- Svelte 5 State ---
	let focalPoint = $state<{ x: number; y: number }>({ x: 0.5, y: 0.5 }); // Normalized 0-1
	let gridLayer = $state<Konva.Layer | null>(null);
	let crosshair = $state<Konva.Group | null>(null);

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);
	let { onCancel }: { onCancel: () => void } = $props();

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'focalpoint') {
			bindTool();
			imageEditorStore.setToolbarControls({
				component: FocalPointControls,
				props: {
					focalX: Math.round(focalPoint.x * 100),
					focalY: Math.round(focalPoint.y * 100),
					onReset: () => resetFocalPoint(),
					onCancel: () => onCancel(),
					onApply: () => apply()
				}
			});
		} else {
			unbindTool();
			if (imageEditorStore.state.toolbarControls?.component === FocalPointControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// --- Event Binding ---
	function bindTool() {
		const { stage, imageNode } = imageEditorStore.state;
		if (!stage || !imageNode || _toolBound) return;
		_toolBound = true;

		// Get existing focal point from metadata
		const metadata = (imageNode as any).metadata;
		if (metadata?.focalPoint) {
			focalPoint = { ...metadata.focalPoint };
		}

		// Create grid overlay
		createGridOverlay();
		createCrosshair();

		// Bind click event
		stage.on('click.focalpoint tap.focalpoint', onStageClick);
		stage.container().style.cursor = 'crosshair';
	}

	function unbindTool() {
		const { stage } = imageEditorStore.state;
		if (!stage || !_toolBound) return;
		_toolBound = false;

		stage.off('click.focalpoint tap.focalpoint');
		if (stage.container()) stage.container().style.cursor = 'default';

		// Remove grid overlay
		gridLayer?.destroy();
		gridLayer = null;
		crosshair = null;
	}

	// --- Grid Overlay ---
	function createGridOverlay() {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !imageNode || !imageGroup) return;

		// Create a new layer for the grid (on top of everything)
		gridLayer = new Konva.Layer();
		stage.add(gridLayer);
		gridLayer.moveToTop();

		const imageWidth = imageNode.width() * imageNode.scaleX();
		const imageHeight = imageNode.height() * imageNode.scaleY();
		const imageX = imageGroup.x();
		const imageY = imageGroup.y();

		// Calculate actual top-left of image (accounting for centering in group)
		const originX = imageX - imageWidth / 2;
		const originY = imageY - imageHeight / 2;

		// Draw rule of thirds grid
		const lineColor = '#00ff00';
		const lineWidth = 1;
		const opacity = 0.7;

		// Vertical lines
		for (let i = 1; i <= 2; i++) {
			const x = originX + (imageWidth / 3) * i;
			const line = new Konva.Line({
				points: [x, originY, x, originY + imageHeight],
				stroke: lineColor,
				strokeWidth: lineWidth,
				opacity: opacity,
				listening: false
			});
			gridLayer.add(line);
		}

		// Horizontal lines
		for (let i = 1; i <= 2; i++) {
			const y = originY + (imageHeight / 3) * i;
			const line = new Konva.Line({
				points: [originX, y, originX + imageWidth, y],
				stroke: lineColor,
				strokeWidth: lineWidth,
				opacity: opacity,
				listening: false
			});
			gridLayer.add(line);
		}

		gridLayer.batchDraw();
	}

	function createCrosshair() {
		const { imageNode, imageGroup } = imageEditorStore.state;
		if (!gridLayer || !imageNode || !imageGroup) return;

		const imageWidth = imageNode.width() * imageNode.scaleX();
		const imageHeight = imageNode.height() * imageNode.scaleY();
		const imageX = imageGroup.x();
		const imageY = imageGroup.y();

		// Calculate actual top-left of image (accounting for centering in group)
		const originX = imageX - imageWidth / 2;
		const originY = imageY - imageHeight / 2;

		// Calculate crosshair position
		const x = originX + imageWidth * focalPoint.x;
		const y = originY + imageHeight * focalPoint.y;

		// Create crosshair group
		crosshair = new Konva.Group({
			x: x,
			y: y,
			listening: false
		});

		// Crosshair lines
		const size = 20;
		const color = '#ff0000';
		const width = 2;

		const hLine = new Konva.Line({
			points: [-size, 0, size, 0],
			stroke: color,
			strokeWidth: width
		});

		const vLine = new Konva.Line({
			points: [0, -size, 0, size],
			stroke: color,
			strokeWidth: width
		});

		// Center circle
		const circle = new Konva.Circle({
			radius: 4,
			fill: color,
			stroke: '#ffffff',
			strokeWidth: 2
		});

		crosshair.add(hLine, vLine, circle);
		gridLayer.add(crosshair);
		gridLayer.batchDraw();
	}

	// --- Event Handlers ---
	function onStageClick() {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !imageNode || !imageGroup) return;

		const pos = stage.getPointerPosition();
		if (!pos) return;

		const imageWidth = imageNode.width() * imageNode.scaleX();
		const imageHeight = imageNode.height() * imageNode.scaleY();
		const originX = imageGroup.x() - imageWidth / 2;
		const originY = imageGroup.y() - imageHeight / 2;

		// Check if click is within image bounds
		if (pos.x < originX || pos.x > originX + imageWidth || pos.y < originY || pos.y > originY + imageHeight) {
			return;
		}

		// Calculate normalized focal point (0-1)
		focalPoint = {
			x: (pos.x - originX) / imageWidth,
			y: (pos.y - originY) / imageHeight
		};

		// Update crosshair position
		updateCrosshair();

		// Update toolbar (reactive)
		imageEditorStore.setToolbarControls({
			component: FocalPointControls,
			props: {
				focalX: Math.round(focalPoint.x * 100),
				focalY: Math.round(focalPoint.y * 100),
				onReset: () => resetFocalPoint(),
				onApply: () => apply()
			}
		});
	}

	function updateCrosshair() {
		const { imageNode, imageGroup } = imageEditorStore.state;
		if (!crosshair || !imageNode || !imageGroup) return;

		const imageWidth = imageNode.width() * imageNode.scaleX();
		const imageHeight = imageNode.height() * imageNode.scaleY();
		const originX = imageGroup.x() - imageWidth / 2;
		const originY = imageGroup.y() - imageHeight / 2;

		const x = originX + imageWidth * focalPoint.x;
		const y = originY + imageHeight * focalPoint.y;

		crosshair.position({ x, y });
		gridLayer?.batchDraw();
	}

	// --- Tool Actions ---
	function resetFocalPoint() {
		focalPoint = { x: 0.5, y: 0.5 };
		updateCrosshair();
	}

	function apply() {
		const { imageNode } = imageEditorStore.state;
		if (!imageNode) return;

		// Save focal point to image metadata
		(imageNode as any).metadata = {
			...(imageNode as any).metadata,
			focalPoint: { ...focalPoint }
		};

		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	// --- Parent Store API ---
	export function cleanup() {
		try {
			unbindTool();
		} catch (e) {
			/* ignore */
		}
	}

	export function saveState() {}

	export function beforeExit() {
		cleanup();
	}
</script>

<!-- No UI needed, all controls in toolbar and grid overlay -->
