<!--
@file: src/components/image-editor/widgets/Rotate/Tool.svelte
@component
Rotate tool using svelte-canvas compatible state.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import RotateControls from './controls.svelte';

	const storeState = imageEditorStore.state;

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'rotate') {
			updateToolbarControls();
		} else if (imageEditorStore.state.toolbarControls?.component === RotateControls) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	// Update toolbar when state changes
	$effect(() => {
		if (imageEditorStore.state.activeState === 'rotate') {
			updateToolbarControls();
		}
	});

	function updateToolbarControls() {
		imageEditorStore.setToolbarControls({
			component: RotateControls,
			props: {
				rotationAngle: storeState.rotation,
				isFlippedH: storeState.flipH,
				isFlippedV: storeState.flipV,
				onRotateLeft: () => setRotation(storeState.rotation - 90),
				onRotateRight: () => setRotation(storeState.rotation + 90),
				onRotationChange: setRotation,
				onFlipHorizontal: toggleFlipH,
				onFlipVertical: toggleFlipV
			}
		});
	}

	function setRotation(angle: number) {
		storeState.rotation = angle;
	}

	function toggleFlipH() {
		storeState.flipH = !storeState.flipH;
	}

	function toggleFlipV() {
		storeState.flipV = !storeState.flipV;
	}

	export function saveState() {}
	export function beforeExit() {}
</script>
