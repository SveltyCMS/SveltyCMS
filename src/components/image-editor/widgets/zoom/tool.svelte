<!--
@file: src/components/image-editor/widgets/Zoom/Tool.svelte
@component
**Zoom Tool "Controller"**

Provides zoom functionality for the image editor using svelte-canvas compatible state.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import ZoomControls from './controls.svelte';

	// --- Svelte 5 State ---
	let minZoom = 0.1;
	let maxZoom = 5;

	const storeState = imageEditorStore.state;

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'zoom') {
			updateToolbar();
		} else if (imageEditorStore.state.toolbarControls?.component === ZoomControls) {
			imageEditorStore.setToolbarControls(null);
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
				onReset: resetZoom
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
		if (!imageElement) {
			return;
		}
		const baseZoom = typeof storeState.zoom === 'number' && storeState.zoom > 0 ? storeState.zoom : 1;
		setZoom(Math.max(0.35, Math.min(baseZoom, 1)));
		storeState.translateX = 0;
		storeState.translateY = 0;
	}

	function fillScreen() {
		const baseZoom = typeof storeState.zoom === 'number' && storeState.zoom > 0 ? storeState.zoom : 1;
		setZoom(Math.min(5, Math.max(baseZoom * 1.18, 1.1)));
		storeState.translateX = 0;
		storeState.translateY = 0;
	}

	function resetZoom() {
		setZoom(1);
		storeState.translateX = 0;
		storeState.translateY = 0;
	}

	export function cleanup() {}
	export function saveState() {}
	export function beforeExit() {
		cleanup();
	}
</script>
