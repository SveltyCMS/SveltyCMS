<!--
@file: src/components/imageEditor/widgets/Rotate/Tool.svelte
@component
Rotate tool using svelte-canvas compatible state.
-->
<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import RotateControls from './Controls.svelte';

	let { onCancel }: { onCancel: () => void } = $props();

	const storeState = imageEditorStore.state;

	// Store original state for reset
	let originalRotation = 0;
	let originalFlipH = false;
	let originalFlipV = false;

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'rotate') {
			initializeTool();
			updateToolbarControls();
		} else {
			if (imageEditorStore.state.toolbarControls?.component === RotateControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// Update toolbar when state changes
	$effect(() => {
		if (imageEditorStore.state.activeState === 'rotate') {
			updateToolbarControls();
		}
	});

	function initializeTool() {
		originalRotation = storeState.rotation;
		originalFlipH = storeState.flipH;
		originalFlipV = storeState.flipV;
	}

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
				onFlipVertical: toggleFlipV,
				onReset: reset,
				onCancel: () => {
					reset();
					onCancel();
				},
				onApply: apply
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

	function reset() {
		storeState.rotation = originalRotation;
		storeState.flipH = originalFlipH;
		storeState.flipV = originalFlipV;
	}

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	export function saveState() {}
	export function beforeExit() {}
</script>
