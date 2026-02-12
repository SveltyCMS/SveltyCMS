<!--
@file: src/components/imageEditor/widgets/Zoom/Tool.svelte
@component
**Zoom Tool "Controller"**

Provides zoom functionality for the image editor:
- Zoom in/out with buttons
- Slider for precise zoom control
- Fit to screen options
- Mouse wheel zoom support
- Pan/scroll support when zoomed
-->

<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import ZoomControls from './Controls.svelte';

	// --- Svelte 5 State ---
	let zoomLevel = $state(1); // 1 = 100%
	let minZoom = $state(0.1); // 10%
	let maxZoom = $state(5); // 500%
	let isPanning = $state(false);
	let lastPointerPosition = $state<{ x: number; y: number } | null>(null);

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	let { onCancel }: { onCancel: () => void } = $props();

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'zoom') {
			bindTool();
			updateZoomFromStage();
			imageEditorStore.setToolbarControls({
				component: ZoomControls,
				props: {
					zoomLevel: Math.round(zoomLevel * 100),
					minZoom: minZoom * 100,
					maxZoom: maxZoom * 100,
					onZoomIn: () => setZoom(zoomLevel * 1.25),
					onZoomOut: () => setZoom(zoomLevel / 1.25),
					onZoomChange: (percent: number) => setZoom(percent / 100),
					onFitToScreen: fitToScreen,
					onFillScreen: fillScreen,
					onActualSize: () => setZoom(1),
					onReset: resetZoom,
					onCancel: () => onCancel(),
					onApply: apply
				}
			});
		} else {
			unbindTool();
			if (imageEditorStore.state.toolbarControls?.component === ZoomControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// --- Event Binding ---
	function bindTool() {
		const { stage } = imageEditorStore.state;
		if (!stage || _toolBound) return;
		_toolBound = true;

		// Enable wheel zoom
		stage.on('wheel.zoom', handleWheel);

		// Enable panning when dragging on stage background
		stage.on('mousedown.zoom touchstart.zoom', handlePanStart);
		stage.on('mousemove.zoom touchmove.zoom', handlePanMove);
		stage.on('mouseup.zoom touchend.zoom', handlePanEnd);

		if (stage.container()) {
			stage.container().style.cursor = 'grab';
		}
	}

	function unbindTool() {
		const { stage } = imageEditorStore.state;
		if (!stage || !_toolBound) return;
		_toolBound = false;

		stage.off('wheel.zoom');
		stage.off('mousedown.zoom touchstart.zoom');
		stage.off('mousemove.zoom touchmove.zoom');
		stage.off('mouseup.zoom touchend.zoom');

		if (stage.container()) {
			stage.container().style.cursor = 'default';
		}
	}

	// --- Zoom Functions ---
	function updateZoomFromStage() {
		const { imageGroup } = imageEditorStore.state;
		if (!imageGroup) return;
		zoomLevel = Math.abs(imageGroup.scaleX());
	}

	function setZoom(newZoom: number) {
		const { imageGroup, stage, layer } = imageEditorStore.state;
		if (!imageGroup || !stage || !layer) return;

		// Clamp zoom level
		const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

		// Get center point
		const stageCenter = {
			x: stage.width() / 2,
			y: stage.height() / 2
		};

		// Update scale while preserving sign (for flip)
		const signX = imageGroup.scaleX() >= 0 ? 1 : -1;
		const signY = imageGroup.scaleY() >= 0 ? 1 : -1;

		imageGroup.scaleX(clampedZoom * signX);
		imageGroup.scaleY(clampedZoom * signY);

		// Keep centered
		imageGroup.position(stageCenter);

		zoomLevel = clampedZoom;
		layer.batchDraw();

		// Update toolbar
		updateToolbarProps();
	}

	function fitToScreen() {
		const { imageNode, imageGroup, stage, layer } = imageEditorStore.state;
		if (!imageNode || !imageGroup || !stage || !layer) return;

		const padding = 0.9; // 90% of stage
		const stageWidth = stage.width();
		const stageHeight = stage.height();
		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();

		const scaleX = (stageWidth * padding) / imageWidth;
		const scaleY = (stageHeight * padding) / imageHeight;
		const newZoom = Math.min(scaleX, scaleY);

		setZoom(newZoom);
	}

	function fillScreen() {
		const { imageNode, imageGroup, stage, layer } = imageEditorStore.state;
		if (!imageNode || !imageGroup || !stage || !layer) return;

		const stageWidth = stage.width();
		const stageHeight = stage.height();
		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();

		const scaleX = stageWidth / imageWidth;
		const scaleY = stageHeight / imageHeight;
		const newZoom = Math.max(scaleX, scaleY);

		setZoom(newZoom);
	}

	function resetZoom() {
		const { imageNode, imageGroup, stage, layer } = imageEditorStore.state;
		if (!imageNode || !imageGroup || !stage || !layer) return;

		// Calculate initial scale (80% of container)
		const containerWidth = stage.width();
		const containerHeight = stage.height();
		const scaleX = (containerWidth * 0.8) / imageNode.width();
		const scaleY = (containerHeight * 0.8) / imageNode.height();
		const initialScale = Math.min(scaleX, scaleY);

		// Reset position and scale
		imageGroup.position({
			x: containerWidth / 2,
			y: containerHeight / 2
		});
		imageGroup.scaleX(initialScale);
		imageGroup.scaleY(initialScale);

		zoomLevel = initialScale;
		layer.batchDraw();

		updateToolbarProps();
	}

	// --- Event Handlers ---
	function handleWheel(e: any) {
		e.evt.preventDefault();
		const { stage, imageGroup, layer } = imageEditorStore.state;
		if (!stage || !imageGroup || !layer) return;

		const oldScale = Math.abs(imageGroup.scaleX());

		// Get pointer position relative to stage
		const pointer = stage.getPointerPosition();
		if (!pointer) return;

		// Calculate zoom factor
		const scaleBy = 1.1;
		const direction = e.evt.deltaY > 0 ? -1 : 1;
		const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

		// Clamp and apply
		setZoom(newScale);
	}

	function handlePanStart(e: any) {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage) return;

		// Only pan if clicking on stage background or image
		const clickedOnEmpty = e.target === stage || e.target === imageNode || e.target === imageGroup;
		if (!clickedOnEmpty) return;

		isPanning = true;
		lastPointerPosition = stage.getPointerPosition();

		if (stage.container()) {
			stage.container().style.cursor = 'grabbing';
		}
	}

	function handlePanMove() {
		if (!isPanning || !lastPointerPosition) return;

		const { stage, imageGroup, layer } = imageEditorStore.state;
		if (!stage || !imageGroup || !layer) return;

		const newPos = stage.getPointerPosition();
		if (!newPos) return;

		const dx = newPos.x - lastPointerPosition.x;
		const dy = newPos.y - lastPointerPosition.y;

		imageGroup.move({ x: dx, y: dy });
		lastPointerPosition = newPos;

		layer.batchDraw();
	}

	function handlePanEnd() {
		isPanning = false;
		lastPointerPosition = null;

		const { stage } = imageEditorStore.state;
		if (stage?.container()) {
			stage.container().style.cursor = 'grab';
		}
	}

	function updateToolbarProps() {
		if (imageEditorStore.state.toolbarControls?.component === ZoomControls) {
			imageEditorStore.setToolbarControls({
				component: ZoomControls,
				props: {
					zoomLevel: Math.round(zoomLevel * 100),
					minZoom: minZoom * 100,
					maxZoom: maxZoom * 100,
					onZoomIn: () => setZoom(zoomLevel * 1.25),
					onZoomOut: () => setZoom(zoomLevel / 1.25),
					onZoomChange: (percent: number) => setZoom(percent / 100),
					onFitToScreen: fitToScreen,
					onFillScreen: fillScreen,
					onActualSize: () => setZoom(1),
					onReset: resetZoom,
					onCancel: () => onCancel(),
					onApply: apply
				}
			});
		}
	}

	// --- Tool Actions ---
	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	// --- Parent Store API ---
	export function cleanup() {
		try {
			unbindTool();
		} catch (_e) {
			/* ignore */
		}
	}

	export function saveState() {
		/* state captured by parent snapshots */
	}

	export function beforeExit() {
		cleanup();
	}
</script>

<!-- No UI needed, all controls in toolbar -->
