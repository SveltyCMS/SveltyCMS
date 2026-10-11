<!--
@file: src/components/image-editor/widgets/Rotate/Tool.svelte
@component
Rotate tool using svelte-canvas compatible state.
-->
<script lang="ts">
	import { bindShortcuts } from '@components/image-editor/bind-shortcuts';
	import { imageEditorStore } from '@components/image-editor/image-editor-store.svelte';
	import RotateControls from './controls.svelte';

	const storeState = imageEditorStore.state;

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'rotate') {
			updateToolbarControls();
		} else if (
			!activeState &&
			imageEditorStore.state.toolbarControls?.component === RotateControls
		) {
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

	$effect(() => {
		if (imageEditorStore.state.activeState !== 'rotate') return;
		return bindShortcuts([
			['arrowleft', () => setRotation(storeState.rotation - 1), 'Nudge rotation left'],
			['shift+arrowleft', () => setRotation(storeState.rotation - 0.1), 'Fine nudge rotation left'],
			['mod+arrowleft', () => setRotation(storeState.rotation - 90), 'Rotate 90 left'],
			['arrowright', () => setRotation(storeState.rotation + 1), 'Nudge rotation right'],
			[
				'shift+arrowright',
				() => setRotation(storeState.rotation + 0.1),
				'Fine nudge rotation right'
			],
			['mod+arrowright', () => setRotation(storeState.rotation + 90), 'Rotate 90 right'],
			['h', () => toggleFlipH(), 'Flip horizontal'],
			['v', () => toggleFlipV(), 'Flip vertical'],
			['0', () => setRotation(0), 'Reset rotation']
		]);
	});

	export function saveState() {}
	export function beforeExit() {}
</script>
