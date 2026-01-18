<!--
@file shared/components/src/imageEditor/widgets/Rotate/Tool.svelte
@component
Rotate Tool "Controller" Component

Features:
- Rotates the image by 90° left or right
- Flips the image horizontally or vertically
-->

<script lang="ts">
	import { imageEditorStore } from '@cms/stores/imageEditorStore.svelte';
	import RotateControls from './Controls.svelte';

	let rotationAngle = $state(0);

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'rotate') {
			// Get current rotation when tool activates
			const { imageGroup } = imageEditorStore.state;
			if (imageGroup) {
				rotationAngle = imageGroup.rotation();
			}

			imageEditorStore.setToolbarControls({
				component: RotateControls,
				props: {
					rotationAngle,
					onRotateLeft: rotateLeft,
					onRotateRight: rotateRight,
					onRotationChange: setRotation,
					onFlipHorizontal: flipHorizontal,
					onFlipVertical: flipVertical,
					onReset: reset,
					onApply: apply
				}
			});
		} else {
			// Only clear controls if they are ours
			if (imageEditorStore.state.toolbarControls?.component === RotateControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	function rotateLeft() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		const currentRotation = imageGroup.rotation();
		const newRotation = (currentRotation - 90) % 360;
		imageGroup.rotation(newRotation);
		rotationAngle = newRotation;
		layer.batchDraw();
	}

	function rotateRight() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		const currentRotation = imageGroup.rotation();
		const newRotation = (currentRotation + 90) % 360;
		imageGroup.rotation(newRotation);
		rotationAngle = newRotation;
		layer.batchDraw();
	}

	function setRotation(angle: number) {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.rotation(angle);
		rotationAngle = angle;
		layer.batchDraw();
	}

	function flipHorizontal() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.scaleX(imageGroup.scaleX() * -1);
		layer.batchDraw();
	}

	function flipVertical() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.scaleY(imageGroup.scaleY() * -1);
		layer.batchDraw();
	}

	function reset() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.rotation(0);
		imageGroup.scaleX(Math.abs(imageGroup.scaleX()));
		imageGroup.scaleY(Math.abs(imageGroup.scaleY()));
		rotationAngle = 0;
		layer.batchDraw();
	}

	function apply() {
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	export function cleanup() {
		/* no cleanup needed */
	}

	export function saveState() {
		/* state captured by parent snapshots */
	}

	export function beforeExit() {
		cleanup();
	}
</script>

// imageEditor/widgets/Rotate/Tool.svelte /** * @file src/components/imageEditor/widgets/Rotate/Tool.svelte * @component * Rotate tool for rotating
and flipping images */
<!-- No UI needed, all controls in toolbar -->
