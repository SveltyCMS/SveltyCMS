<!--
@file: src/components/imageEditor/FocalPoint.svelte
@component
A draggable focal point crosshair with enhanced visibility, animations,
and accessibility features.

#### Props
- `stage`: Konva stage instance
- `imageNode`: Konva image node
- `x`: Initial X position (0-100%)
- `y`: Initial Y position (0-100%)
- `onapply`: Callback when focal point is set

#### Features
- Draggable crosshair with visual feedback
- Auto-contrast for visibility on any image
- Touch and keyboard support
- Smooth animations
- Real-time position display
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	let {
		stage,
		imageNode,
		x = 50,
		y = 50,
		onapply = () => {},
		oncancel = () => {}
	}: {
		stage: Konva.Stage;
		imageNode: Konva.Image;
		x?: number;
		y?: number;
		onapply?: (detail: { x: number; y: number }) => void;
		oncancel?: () => void;
	} = $props();

	let crosshair: Konva.Group;
	let isDragging = $state(false);
	let currentX = $state(x);
	let currentY = $state(y);

	// Calculate initial position
	function getInitialPosition() {
		const imageRect = imageNode.getClientRect();
		return {
			x: imageRect.x + (imageRect.width * x) / 100,
			y: imageRect.y + (imageRect.height * y) / 100
		};
	}

	onMount(() => {
		const layer = stage.getLayers()[0];
		const initialPos = getInitialPosition();

		// Create crosshair group
		const group = new Konva.Group({
			draggable: true,
			x: initialPos.x,
			y: initialPos.y,
			dragBoundFunc: (pos) => {
				const imageRect = imageNode.getClientRect();
				const clampedX = Math.max(imageRect.x, Math.min(imageRect.x + imageRect.width, pos.x));
				const clampedY = Math.max(imageRect.y, Math.min(imageRect.y + imageRect.height, pos.y));
				return { x: clampedX, y: clampedY };
			}
		});

		// Outer glow circle for better visibility
		const outerGlow = new Konva.Circle({
			radius: 30,
			fill: 'rgba(59, 130, 246, 0.1)',
			stroke: 'rgba(59, 130, 246, 0.3)',
			strokeWidth: 2,
			shadowColor: 'rgba(59, 130, 246, 0.5)',
			shadowBlur: 10,
			shadowOpacity: 0.5
		});

		// Main circle
		const circle = new Konva.Circle({
			radius: 20,
			stroke: 'white',
			strokeWidth: 3,
			dash: [6, 4],
			shadowColor: 'black',
			shadowBlur: 4,
			shadowOpacity: 0.3
		});

		// Inner circle for contrast
		const innerCircle = new Konva.Circle({
			radius: 15,
			stroke: 'rgba(0, 0, 0, 0.5)',
			strokeWidth: 1
		});

		// Center dot
		const centerDot = new Konva.Circle({
			radius: 4,
			fill: 'rgba(59, 130, 246, 1)',
			stroke: 'white',
			strokeWidth: 2
		});

		// Crosshair lines with better visibility
		const horizLine = new Konva.Line({
			points: [-30, 0, 30, 0],
			stroke: 'white',
			strokeWidth: 2,
			shadowColor: 'black',
			shadowBlur: 2
		});

		const vertLine = new Konva.Line({
			points: [0, -30, 0, 30],
			stroke: 'white',
			strokeWidth: 2,
			shadowColor: 'black',
			shadowBlur: 2
		});

		// Add all shapes to group
		group.add(outerGlow, circle, innerCircle, horizLine, vertLine, centerDot);
		layer.add(group);
		crosshair = group;

		// Animate entrance
		group.opacity(0);
		group.scale({ x: 0.5, y: 0.5 });

		const tween = new Konva.Tween({
			node: group,
			duration: 0.3,
			opacity: 1,
			scaleX: 1,
			scaleY: 1,
			easing: Konva.Easings.EaseOut
		});
		tween.play();

		// Drag events
		group.on('dragstart', () => {
			isDragging = true;
			group.to({
				scaleX: 1.2,
				scaleY: 1.2,
				duration: 0.1
			});

			// Change cursor
			stage.container().style.cursor = 'grabbing';
		});

		group.on('dragmove', () => {
			updatePosition();
		});

		group.on('dragend', () => {
			isDragging = false;
			group.to({
				scaleX: 1,
				scaleY: 1,
				duration: 0.2
			});

			stage.container().style.cursor = 'grab';
			applyFocalPoint();
		});

		// Hover effects
		group.on('mouseenter', () => {
			stage.container().style.cursor = 'grab';
			if (!isDragging) {
				group.to({
					scaleX: 1.1,
					scaleY: 1.1,
					duration: 0.15
				});
			}
		});

		group.on('mouseleave', () => {
			if (!isDragging) {
				stage.container().style.cursor = 'default';
				group.to({
					scaleX: 1,
					scaleY: 1,
					duration: 0.15
				});
			}
		});

		// Pulse animation to draw attention
		const pulseAnim = new Konva.Tween({
			node: outerGlow,
			duration: 1.5,
			scaleX: 1.2,
			scaleY: 1.2,
			opacity: 0,
			easing: Konva.Easings.EaseInOut,
			onFinish: function () {
				outerGlow.scale({ x: 1, y: 1 });
				outerGlow.opacity(0.1);
				pulseAnim.reset();
				pulseAnim.play();
			}
		});
		pulseAnim.play();

		// Touch support
		group.on('touchstart', () => {
			isDragging = true;
		});

		group.on('touchend', () => {
			isDragging = false;
			applyFocalPoint();
		});

		// Update initial position
		updatePosition();

		layer.batchDraw();

		return () => {
			pulseAnim.destroy();
			crosshair?.destroy();
			stage.container().style.cursor = 'default';
		};
	});

	function updatePosition() {
		const pos = crosshair.position();
		const imageRect = imageNode.getClientRect();

		// Calculate percentage position
		currentX = Math.round(((pos.x - imageRect.x) / imageRect.width) * 100);
		currentY = Math.round(((pos.y - imageRect.y) / imageRect.height) * 100);

		// Clamp values
		currentX = Math.max(0, Math.min(100, currentX));
		currentY = Math.max(0, Math.min(100, currentY));
	}

	function applyFocalPoint() {
		onapply({ x: currentX, y: currentY });
	}

	function handleKeyDown(e: KeyboardEvent) {
		const step = e.shiftKey ? 10 : 1; // Larger steps with Shift
		const imageRect = imageNode.getClientRect();
		const pos = crosshair.position();
		let newX = pos.x;
		let newY = pos.y;

		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				newX = Math.max(imageRect.x, pos.x - step);
				break;
			case 'ArrowRight':
				e.preventDefault();
				newX = Math.min(imageRect.x + imageRect.width, pos.x + step);
				break;
			case 'ArrowUp':
				e.preventDefault();
				newY = Math.max(imageRect.y, pos.y - step);
				break;
			case 'ArrowDown':
				e.preventDefault();
				newY = Math.min(imageRect.y + imageRect.height, pos.y + step);
				break;
			case 'Enter':
				e.preventDefault();
				applyFocalPoint();
				return;
			case 'Escape':
				e.preventDefault();
				oncancel();
				return;
		}

		crosshair.position({ x: newX, y: newY });
		updatePosition();
		stage.batchDraw();
	}
</script>

<!-- Position indicator overlay -->
<div
	class="focal-point-indicator fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
	class:opacity-100={isDragging}
	class:opacity-0={!isDragging}
>
	<div class="bg-surface-900/90 dark:bg-surface-100/90 text-white dark:text-surface-900 px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm">
		<div class="flex items-center gap-3">
			<iconify-icon icon="mdi:crosshairs" width="20"></iconify-icon>
			<div class="text-sm font-mono">
				<span class="font-semibold">X:</span>
				{currentX}%
				<span class="mx-2">|</span>
				<span class="font-semibold">Y:</span>
				{currentY}%
			</div>
		</div>
	</div>
</div>

<!-- Instructions overlay -->
<div class="focal-point-instructions absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
	<div class="bg-surface-900/80 dark:bg-surface-100/80 text-white dark:text-surface-900 px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm">
		<div class="flex items-center gap-2 text-xs">
			<iconify-icon icon="mdi:gesture-tap" width="16"></iconify-icon>
			<span>Drag or use arrow keys to position</span>
			<span class="mx-1">•</span>
			<span class="font-semibold">Enter</span> to apply
			<span class="mx-1">•</span>
			<span class="font-semibold">Esc</span> to cancel
		</div>
	</div>
</div>

<svelte:window onkeydown={handleKeyDown} />

<style>
	.focal-point-indicator {
		transition: opacity 0.2s ease-in-out;
	}

	.focal-point-instructions {
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translate(-50%, 20px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
</style>
