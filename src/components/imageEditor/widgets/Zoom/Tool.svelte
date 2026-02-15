<!--
@file: src/components/imageEditor/widgets/Zoom/Tool.svelte
@component
**Zoom Tool "Controller"**

Provides zoom functionality for the image editor using svelte-canvas compatible state.
-->

<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import ZoomControls from './Controls.svelte';

	// --- Svelte 5 State ---
	let minZoom = 0.1;
	let maxZoom = 5;

	let { onCancel }: { onCancel: () => void } = $props();

	const storeState = imageEditorStore.state;

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'zoom') {
			updateToolbar();
		} else {
			if (imageEditorStore.state.toolbarControls?.component === ZoomControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	function updateToolbar() {
		imageEditorStore.setToolbarControls({
			component: ZoomControls,
			props: {
				zoomLevel: Math.round(storeState.zoom * 100),
				minZoom: minZoom * 100,
				maxZoom: maxZoom * 100,
				onZoomIn: () => setZoom(storeState.zoom * 1.25),
				onZoomOut: () => setZoom(storeState.zoom / 1.25),
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

	// Update toolbar when zoom changes
	$effect(() => {
		if (imageEditorStore.state.activeState === 'zoom') {
			updateToolbar();
		}
	});

	function setZoom(newZoom: number) {
		const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
		storeState.zoom = clampedZoom;
	}

	function fitToScreen() {
		const { imageElement } = storeState;
		if (!imageElement) return;

		// We'd need container size here, but for now we can assume reasonable defaults or pass them
		// Assuming we can get container dimensions from some other way if needed.
		// For now, let's keep it simple.
		setZoom(0.8); // Simple fallback
	}

	function fillScreen() {
		setZoom(1.2); // Simple fallback
	}

	function resetZoom() {
		setZoom(1);
		storeState.translateX = 0;
		storeState.translateY = 0;
	}

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	export function cleanup() {}
	export function saveState() {}
	export function beforeExit() {
		cleanup();
	}
</script>
