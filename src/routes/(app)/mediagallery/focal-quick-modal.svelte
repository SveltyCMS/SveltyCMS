<!--
@file src/routes/(app)/mediagallery/FocalQuickModal.svelte
@component
**Quick Focal Point Adjustment Modal**

A lightweight modal for quickly adjusting the focal point of an image
without opening the full image editor. Features a draggable crosshair
and rule-of-thirds grid overlay.

@example
<FocalQuickModal 
	media={selectedImage} 
	bind:show={showModal} 
	onSave={handleFocalSave} 
/>
-->

<script lang="ts">
import { registerHotkey } from "@src/utils/hotkeys";
import { onMount } from "svelte";
import type { MediaImage } from "@utils/media/media-models";
	import { fade, scale } from "svelte/transition";
		import Button from '@components/ui/button.svelte';
		import AspectPreview from '@components/media/aspect-preview.svelte';
		import { page } from '$app/state';

interface Props {
	/** The media image to adjust focal point for */
	media: MediaImage;
	/** Callback when modal is closed without saving */
	onClose: () => void;
	/** Callback when focal point is saved */
	onSave: (focalPoint: { x: number; y: number }) => void;
	/** Whether to show the modal */
	show: boolean;
}

let { media, show = $bindable(), onClose, onSave }: Props = $props();

// Initialize focal point with defaults
let focalPoint = $state({
	x: 50,
	y: 50,
});

	let containerRef: HTMLDivElement | undefined = $state();
	let isDragging = $state(false);
	const focalPointPluginEnabled = $derived(page.data?.pluginStates?.['focal-point'] === true);

// Reset focal point when media changes
$effect(() => {
	if (media) {
		focalPoint = {
			x: media.metadata?.focalPoint?.x ?? 50,
			y: media.metadata?.focalPoint?.y ?? 50,
		};
	}
});

function handleMouseDown(e: MouseEvent) {
	isDragging = true;
	updateFocalPoint(e);
}

function handleMouseMove(e: MouseEvent) {
	if (isDragging) {
		updateFocalPoint(e);
	}
}

function handleMouseUp() {
	isDragging = false;
}

function updateFocalPoint(e: MouseEvent) {
	if (!containerRef) {
		return;
	}
	const rect = containerRef.getBoundingClientRect();
	focalPoint = {
		x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
		y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
	};
}

function handleKeyDown(e: KeyboardEvent) {
	const step = e.shiftKey ? 10 : 1;
	switch (e.key) {
		case "ArrowLeft":
			focalPoint.x = Math.max(0, focalPoint.x - step);
			e.preventDefault();
			break;
		case "ArrowRight":
			focalPoint.x = Math.min(100, focalPoint.x + step);
			e.preventDefault();
			break;
		case "ArrowUp":
			focalPoint.y = Math.max(0, focalPoint.y - step);
			e.preventDefault();
			break;
		case "ArrowDown":
			focalPoint.y = Math.min(100, focalPoint.y + step);
			e.preventDefault();
			break;
	}
}

onMount(() => {
	registerHotkey(
		"mod+s",
		() => {
			if (show) handleSave();
		},
		"Save focal point",
	);

	registerHotkey(
		"escape",
		() => {
			if (show) handleClose();
		},
		"Cancel focal point adjustment",
		false,
	);
});

function handleSave() {
	onSave(focalPoint);
	show = false;
}

function handleClose() {
	onClose();
	show = false;
}

function resetToCenter() {
	focalPoint = { x: 50, y: 50 };
}

// Get image URL (prefer thumbnail for faster loading)
const imageUrl = $derived(
	media.thumbnails?.md?.url || media.thumbnails?.sm?.url || media.url,
);
</script>

{#if show}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="focal-modal-title"
		onkeydown={handleKeyDown}
	>
		<!-- Backdrop click to close -->
		<div
			class="fixed inset-0"
			onclick={handleClose}
			role="button"
			tabindex="0"
			aria-label="Close modal"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') handleClose();
			}}
		></div>

		<div
			class="relative flex max-h-[90vh] w-full flex-col rounded bg-surface-100 shadow-xl dark:bg-surface-800 mx-4"
			class:max-w-lg={!focalPointPluginEnabled}
			class:max-w-3xl={focalPointPluginEnabled}
			transition:scale={{ start: 0.95, duration: 150 }}
		>
			<!-- Header -->
			<header class="flex items-center justify-between border-b border-surface-300 p-4 dark:text-surface-50">
				<h3 id="focal-modal-title" class="text-lg font-semibold flex items-center gap-2">
					<iconify-icon icon="mdi:crosshairs-gps" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					Set Focal Point
				</h3>
				<Button variant="outline" onclick={handleClose} aria-label="Close (Escape)" aria-keyshortcuts="Escape" class="p-0! min-w-0">
					<iconify-icon icon="mdi:close" width="20"></iconify-icon>
				</Button>
			</header>

			<!-- Image Container -->
			<div class="p-4">
				<p class="text-sm text-surface-500 dark:text-surface-50 mb-3">
					Click or drag to set the focal point. This determines the focus area when the image is cropped for different sizes.
				</p>

				<div
					bind:this={containerRef}
					class="relative cursor-crosshair select-none rounded overflow-hidden border-2 border-surface-300 dark:border-surface-600"
					onmousedown={handleMouseDown}
					onmousemove={handleMouseMove}
					onmouseup={handleMouseUp}
					onmouseleave={handleMouseUp}
					role="slider"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={focalPoint.x}
					aria-label="Focal point position"
					tabindex="0"
				>
					<img src={imageUrl} alt={media.filename} class="w-full h-auto max-h-[50vh] object-contain" />

					<!-- Rule of Thirds Grid Overlay -->
					<div class="absolute inset-0 pointer-events-none">
						<!-- Border -->
						<div class="absolute inset-0 border border-white/20"></div>
						<!-- Horizontal lines -->
						<div class="absolute top-1/3 inset-s-0 inset-e-0 h-px bg-white/30"></div>
						<div class="absolute top-2/3 inset-s-0 inset-e-0 h-px bg-white/30"></div>
						<!-- Vertical lines -->
						<div class="absolute inset-s-1/3 top-0 bottom-0 w-px bg-white/30"></div>
						<div class="absolute inset-s-2/3 top-0 bottom-0 w-px bg-white/30"></div>
					</div>

					<!-- Crosshair -->
					<div
						class="absolute pointer-events-none transition-all duration-75"
						style="left: {focalPoint.x}%; top: {focalPoint.y}%; transform: translate(-50%, -50%);"
					>
						<!-- Outer glow -->
						<div class="absolute inset-0 w-8 h-8 rounded-full bg-tertiary-500 dark:bg-primary-500/20 blur-sm -translate-x-1/2 -translate-y-1/2"></div>
						<!-- Crosshair icon -->
						<iconify-icon icon="mdi:crosshairs-gps" width="32" class="text-tertiary-500 dark:text-primary-500 drop-shadow-lg relative z-10"></iconify-icon>
					</div>
				</div>

				{#if focalPointPluginEnabled}
					<div class="mt-4 border-t border-surface-200 pt-3 dark:border-surface-600">
						<h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
							Crop Previews
						</h4>
						<AspectPreview
							imageUrl={media.url}
							{focalPoint}
							readonly={true}
						/>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<footer class="flex items-center justify-between border-t border-surface-300 p-4 dark:text-surface-50">
				<div class="flex items-center gap-4">
					<!-- Coordinate display -->
					<div class="text-sm font-mono text-surface-600 dark:text-surface-50 bg-surface-200 dark:bg-surface-700 px-2 py-1 rounded">
						X: {focalPoint.x.toFixed(0)}% | Y: {focalPoint.y.toFixed(0)}%
					</div>
					<!-- Reset button -->
					<Button variant="outline" onclick={resetToCenter} title="Reset to center" size="sm">
						<iconify-icon icon="mdi:target" width="16"></iconify-icon>
						<span>Center</span>
					</Button>
				</div>

				<div class="flex gap-2">
					<Button variant="outline" onclick={handleClose} aria-keyshortcuts="Escape">Cancel</Button>
					<Button variant="tertiary" onclick={handleSave} aria-keyshortcuts="mod+s" class="dark:">
						<iconify-icon icon="mdi:check" width="18"></iconify-icon>
						<span>Save</span>
					</Button>
				</div>
			</footer>
		</div>
	</div>
{/if}
