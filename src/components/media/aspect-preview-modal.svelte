<!--
@file src/components/media/aspect-preview-modal.svelte
@component
**Modal wrapper for AspectPreview with focal point saving**

Opens a full modal dialog showing aspect ratio previews for a media item,
with interactive focal point adjustment that persists to the server.

### Props
- `media`: Media-like object with _id, url/thumbnails, metadata.focalPoint
- `show`: boolean bindable to control visibility
- `onClose`: callback when modal is dismissed
- `onSave`: callback after focal point is saved to server

### Features:
- Loads existing focal point from media metadata
- Live preview across 7 common aspect ratios
- Drag or keyboard to adjust focal point
- Saves via PATCH /api/media/:id on explicit save
- Escape to close, Mod+S to save
-->

<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { registerHotkey } from '@src/utils/hotkeys';
	import { logger } from '@utils/logger';
	import { updateMediaMetadata } from '@utils/media/media-utils';
	import Button from '@components/ui/button.svelte';
	import AspectPreview from './aspect-preview.svelte';

	interface MediaRef {
		_id?: string;
		url?: string;
		thumbnails?: { md?: { url?: string }; sm?: { url?: string } };
		metadata?: { focalPoint?: { x: number; y: number } };
		filename?: string;
	}

	interface Props {
		media: MediaRef;
		show: boolean;
		onClose: () => void;
		onSave?: (focalPoint: { x: number; y: number }) => void;
	}

	let {
		media,
		show = $bindable(false),
		onClose,
		onSave,
	}: Props = $props();

	let focalPoint = $state({ x: 50, y: 50 });
	let isSaving = $state(false);

	// Derive the best available image URL (prefer medium thumbnail for performance)
	const imageUrl = $derived(
		media?.thumbnails?.md?.url || media?.thumbnails?.sm?.url || media?.url || '',
	);

	// Reset focal point when media changes
	$effect(() => {
		if (show && media) {
			focalPoint = {
				x: media.metadata?.focalPoint?.x ?? 50,
				y: media.metadata?.focalPoint?.y ?? 50,
			};
		}
	});

	onMount(() => {
		registerHotkey('mod+s', () => {
			if (show) handleSave();
		}, 'Save focal point from aspect preview');
		registerHotkey('escape', () => {
			if (show) handleClose();
		}, 'Close aspect preview', false);
	});

	function handleFocalChange(fp: { x: number; y: number }) {
		focalPoint = fp;
	}

	async function handleSave() {
		if (!media?._id) return;

		isSaving = true;
		try {
			await updateMediaMetadata(media._id, { focalPoint });
			onSave?.(focalPoint);
			show = false;
		} catch (err) {
			logger.error('Failed to save focal point from aspect preview', err);
		} finally {
			isSaving = false;
		}
	}

	function handleClose() {
		onClose();
		show = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}
</script>

{#if show}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="aspect-preview-title"
		onkeydown={handleKeyDown}
	>
		<!-- Backdrop -->
		<button
			class="fixed inset-0 cursor-default"
			onclick={handleClose}
			aria-label="Close aspect preview"
		></button>

		<div
			class="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-surface-100 shadow-2xl dark:bg-surface-900 mx-4"
			transition:scale={{ start: 0.95, duration: 150 }}
		>
			<!-- Header -->
			<header class="flex shrink-0 items-center justify-between border-b border-surface-300 px-5 py-4 dark:border-surface-700">
				<div class="flex items-center gap-3">
					<iconify-icon icon="mdi:aspect-ratio" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<div>
						<h3 id="aspect-preview-title" class="text-lg font-semibold text-surface-900 dark:text-surface-50">
							Aspect Ratio Preview
						</h3>
						<p class="text-xs text-surface-500 dark:text-surface-400">
							{media?.filename ?? 'Image'} — drag or use arrow keys to adjust focal point
						</p>
					</div>
				</div>
				<Button variant="outline" onclick={handleClose} aria-label="Close" class="p-0! min-w-0">
					<iconify-icon icon="mdi:close" width="20"></iconify-icon>
				</Button>
			</header>

			<!-- Scrollable preview area -->
			<div class="flex-1 overflow-y-auto px-5 py-4">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<span class="text-sm text-surface-600 dark:text-surface-400">
						See how this image crops to different aspect ratios. The focal point ensures the important area stays visible.
					</span>
					<!-- Focal point coordinates -->
					<div class="rounded bg-surface-200 px-2 py-0.5 font-mono text-xs text-surface-600 dark:bg-surface-700 dark:text-surface-300">
						X: {focalPoint.x.toFixed(0)}% &nbsp; Y: {focalPoint.y.toFixed(0)}%
					</div>
				</div>

				<AspectPreview
					{imageUrl}
					focalPoint={focalPoint}
					onFocalChange={handleFocalChange}
					interactive={true}
				/>
			</div>

			<!-- Footer -->
			<footer class="flex shrink-0 items-center justify-between border-t border-surface-300 px-5 py-3 dark:border-surface-700">
				<Button variant="outline" onclick={() => { focalPoint = { x: 50, y: 50 }; }}>
					<iconify-icon icon="mdi:target" width="16"></iconify-icon>
					<span>Reset to Center</span>
				</Button>

				<div class="flex gap-2">
					<Button variant="outline" onclick={handleClose}>Cancel</Button>
					<Button variant="tertiary" onclick={handleSave} disabled={isSaving}>
						{#if isSaving}
							<iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
						{/if}
						<iconify-icon icon="mdi:check" width="18"></iconify-icon>
						<span>Save Focal Point</span>
					</Button>
				</div>
			</footer>
		</div>
	</div>
{/if}
