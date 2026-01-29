<!--
@file: src/components/imageEditor/widgets/Rotate/Tool.svelte
@component
Rotate tool with straighten and visual guides
-->
<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import RotateControls from './Controls.svelte';

	let { onCancel }: { onCancel: () => void } = $props();

	let rotationAngle = $state(0);
	let isFlippedH = $state(false);
	let isFlippedV = $state(false);
	let showGrid = $state(false);
	let snapToAngles = $state(true);
	let gridGroup: Konva.Group | null = null;
	let horizonLine: Konva.Line | null = null;
	let isStraightenMode = $state(false);

	// Store original state for reset
	let originalRotation = 0;
	let originalScaleX = 1;
	let originalScaleY = 1;

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'rotate') {
			initializeTool();
			updateToolbarControls();
		} else {
			cleanup();
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
		const { imageGroup } = imageEditorStore.state;
		if (!imageGroup) return;

		// Store original state
		originalRotation = imageGroup.rotation();
		originalScaleX = imageGroup.scaleX();
		originalScaleY = imageGroup.scaleY();

		rotationAngle = originalRotation;
		isFlippedH = originalScaleX < 0;
		isFlippedV = originalScaleY < 0;

		// Create grid if enabled
		if (showGrid) {
			createGrid();
		}
	}

	function updateToolbarControls() {
		imageEditorStore.setToolbarControls({
			component: RotateControls,
			props: {
				rotationAngle,
				isFlippedH,
				isFlippedV,
				showGrid,
				snapToAngles,
				onRotateLeft: () => rotate(-90),
				onRotateRight: () => rotate(90),
				onRotationChange: setRotation,
				onFlipHorizontal: flipHorizontal,
				onFlipVertical: flipVertical,
				onStraighten: startStraighten,
				onAutoStraighten: autoStraighten,
				onGridToggle: toggleGrid,
				onSnapToggle: toggleSnap,
				onReset: reset,
				onCancel: () => {
					reset();
					onCancel();
				},
				onApply: apply
			}
		});
	}

	function rotate(degrees: number) {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		const newRotation = rotationAngle + degrees;
		setRotation(newRotation);
	}

	function setRotation(angle: number) {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		// Apply snapping
		if (snapToAngles) {
			const snapDegrees = 15;
			angle = Math.round(angle / snapDegrees) * snapDegrees;
		}

		imageGroup.rotation(angle);
		rotationAngle = angle;
		updateGrid();
		layer.batchDraw();
	}

	function flipHorizontal() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.scaleX(imageGroup.scaleX() * -1);
		isFlippedH = !isFlippedH;
		layer.batchDraw();
	}

	function flipVertical() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.scaleY(imageGroup.scaleY() * -1);
		isFlippedV = !isFlippedV;
		layer.batchDraw();
	}

	function startStraighten() {
		isStraightenMode = !isStraightenMode;

		if (isStraightenMode) {
			createHorizonLine();
			// TODO: Add mouse handlers for drawing straighten line
		} else {
			removeHorizonLine();
		}
	}

	function autoStraighten() {
		// Simple auto-straighten: find nearest 90-degree angle
		const current = rotationAngle % 360;
		const angles = [0, 90, 180, 270, 360];

		const nearest = angles.reduce((prev, curr) => {
			return Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev;
		});

		setRotation(nearest);
	}

	function toggleGrid() {
		showGrid = !showGrid;

		if (showGrid) {
			createGrid();
		} else {
			removeGrid();
		}
	}

	function toggleSnap() {
		snapToAngles = !snapToAngles;
	}

	function createGrid() {
		const { stage, layer } = imageEditorStore.state;
		if (!stage || !layer || gridGroup) return;

		gridGroup = new Konva.Group({
			listening: false,
			name: 'rotateGrid'
		});

		const width = stage.width();
		const height = stage.height();
		const spacing = 50;

		// Vertical lines
		for (let x = 0; x <= width; x += spacing) {
			const line = new Konva.Line({
				points: [x, 0, x, height],
				stroke: 'rgba(255, 255, 255, 0.2)',
				strokeWidth: 1,
				listening: false
			});
			gridGroup.add(line);
		}

		// Horizontal lines
		for (let y = 0; y <= height; y += spacing) {
			const line = new Konva.Line({
				points: [0, y, width, y],
				stroke: 'rgba(255, 255, 255, 0.2)',
				strokeWidth: 1,
				listening: false
			});
			gridGroup.add(line);
		}

		// Center lines (thicker)
		const centerV = new Konva.Line({
			points: [width / 2, 0, width / 2, height],
			stroke: 'rgba(255, 255, 255, 0.4)',
			strokeWidth: 2,
			listening: false
		});

		const centerH = new Konva.Line({
			points: [0, height / 2, width, height / 2],
			stroke: 'rgba(255, 255, 255, 0.4)',
			strokeWidth: 2,
			listening: false
		});

		gridGroup.add(centerV, centerH);
		layer.add(gridGroup);
		gridGroup.moveToTop();
		layer.batchDraw();
	}

	function updateGrid() {
		// Grid doesn't need rotation - it stays fixed
	}

	function removeGrid() {
		if (gridGroup) {
			gridGroup.destroy();
			gridGroup = null;
			imageEditorStore.state.layer?.batchDraw();
		}
	}

	function createHorizonLine() {
		const { stage, layer } = imageEditorStore.state;
		if (!stage || !layer) return;

		const width = stage.width();
		const height = stage.height();

		horizonLine = new Konva.Line({
			points: [0, height / 2, width, height / 2],
			stroke: '#3b82f6',
			strokeWidth: 2,
			dash: [10, 5],
			listening: false,
			name: 'horizonLine'
		});

		layer.add(horizonLine);
		horizonLine.moveToTop();
		layer.batchDraw();
	}

	function removeHorizonLine() {
		if (horizonLine) {
			horizonLine.destroy();
			horizonLine = null;
			imageEditorStore.state.layer?.batchDraw();
		}
	}

	function reset() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.rotation(originalRotation);
		imageGroup.scaleX(Math.abs(originalScaleX));
		imageGroup.scaleY(Math.abs(originalScaleY));

		rotationAngle = originalRotation;
		isFlippedH = false;
		isFlippedV = false;

		layer.batchDraw();
	}

	function apply() {
		removeGrid();
		removeHorizonLine();
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	function cleanup() {
		removeGrid();
		removeHorizonLine();
		isStraightenMode = false;
	}

	export function saveState() {
		/* state captured by snapshots */
	}

	export function beforeExit() {
		cleanup();
	}
</script>

<!-- Instructions overlay -->
{#if isStraightenMode}
	<div class="straighten-instructions">
		<div class="instructions-content">
			<iconify-icon icon="mdi:information-outline" width="20"></iconify-icon>
			<span>Draw a line along the horizon or any straight edge</span>
		</div>
	</div>
{/if}

<style>
	.straighten-instructions {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		pointer-events: none;
	}

	.instructions-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(59, 130, 246, 0.9);
		color: white;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}
</style>
