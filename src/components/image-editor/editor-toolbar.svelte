<!--
@file: src/components/image-editor/editor-toolbar.svelte
@component
**Pintura-style professional bottom toolbar**

Features:
- Dynamic controls based on active tool
- Clean tool grouping with visual hierarchy
- Keyboard shortcuts support
- Responsive layout (mobile + desktop)
- Smooth animations and transitions
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { fade } from 'svelte/transition';
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';

	let {
		onsave,
		isSaving,
		onZoomIn = () => {},
		onZoomOut = () => {},
		onZoomReset = () => {}
	}: {
		onsave: () => void;
		isSaving: boolean;
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onZoomReset?: () => void;
	} = $props();

	const canUndo = $derived(imageEditorStore.canUndoState);
	const canRedo = $derived(imageEditorStore.canRedoState);
	const isComparing = $derived(imageEditorStore.compareSliderPosition > 0);

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		// Ctrl/Cmd+S: Save
		if (cmdOrCtrl && e.key === 's') {
			e.preventDefault();
			onsave();
		}

		// Ctrl/Cmd+Z: Undo
		if (cmdOrCtrl && !e.shiftKey && e.key === 'z') {
			e.preventDefault();
			imageEditorStore.handleUndo();
		}

		// Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z: Redo
		if ((cmdOrCtrl && e.shiftKey && e.key === 'z') || (cmdOrCtrl && e.key === 'y')) {
			e.preventDefault();
			imageEditorStore.handleRedo();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
	class="editor-toolbar relative z-10 flex flex-col border-t border-white/10 bg-[linear-gradient(180deg,rgba(27,27,27,0.98),rgba(12,12,12,0.98))] backdrop-blur-xl shadow-[0_-8px_24px_rgba(0,0,0,0.18)] shrink-0"
	role="toolbar"
	aria-label="Image editor"
>
	<!-- Footer actions -->
	<div class="footer-actions flex items-center justify-between gap-3 px-4 py-3 max-md:flex-col max-md:items-stretch max-md:gap-2">
		<div class="shortcut-hint flex items-center gap-1 text-xs text-surface-400">
			<iconify-icon icon="mdi:keyboard" width="16"></iconify-icon>
			<span>Ctrl+S save, Esc cancel, Ctrl+Z or Ctrl+Y redo</span>
		</div>
		<div class="action-group flex items-center gap-2 max-md:w-full max-md:flex-wrap max-md:justify-between">
			<Button variant="outline"
				type="button"
				onclick={() => imageEditorStore.compareSliderPosition = imageEditorStore.compareSliderPosition > 0 ? 0 : 50}
				title="Compare before / after"
				aria-pressed={isComparing}
				aria-label="Toggle split-screen compare mode"
			>
				<iconify-icon icon="mdi:compare" width="16"></iconify-icon>
				<span class="text-xs font-medium">{isComparing ? 'On' : 'Compare'}</span>
			</Button>
			<div class="me-2 flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-1 max-md:me-0 max-md:flex-1 max-md:justify-between">
				<Button variant="outline"
					type="button"
					onclick={onZoomOut}
					title="Zoom out (-)"
					aria-label="Zoom out"
					aria-keyshortcuts="-"
				>
					<iconify-icon icon="mdi:magnify-minus" width="16"></iconify-icon>
				</Button>
				<Button variant="outline"
					type="button"
					onclick={onZoomReset}
					title="Reset zoom (0)"
					aria-label="Reset zoom"
					aria-keyshortcuts="0"
				>
					<iconify-icon icon="mdi:magnify" width="16"></iconify-icon>
				</Button>
				<Button variant="outline"
					type="button"
					onclick={onZoomIn}
					title="Zoom in (+)"
					aria-label="Zoom in"
					aria-keyshortcuts="+"
				>
					<iconify-icon icon="mdi:magnify-plus" width="16"></iconify-icon>
				</Button>
			</div>
			<Button variant="outline"
				type="button"
				onclick={() => imageEditorStore.handleUndo()}
				disabled={!canUndo}
				title="Undo (Mod+Z)"
				aria-label="Undo last change"
				aria-keyshortcuts="Mod+Z"
			>
				<iconify-icon icon="mdi:undo" width="18"></iconify-icon>
			</Button>
			<Button variant="outline"
				type="button"
				onclick={() => imageEditorStore.handleRedo()}
				disabled={!canRedo}
				title="Redo (Mod+Shift+Z)"
				aria-label="Redo last undone change"
				aria-keyshortcuts="Mod+Shift+Z"
			>
				<iconify-icon icon="mdi:redo" width="18"></iconify-icon>
			</Button>
			<Button variant="outline"
				type="button"
				onclick={onsave}
				disabled={isSaving}
				title="Save changes (Mod+S)"
				aria-label="Save edited image"
				aria-keyshortcuts="Mod+S"
			>
				{#if isSaving}
					<iconify-icon icon="mdi:loading" width="18" class="animate-spin" aria-hidden="true"></iconify-icon>
				{:else}
					<iconify-icon icon="mdi:check" width="18" aria-hidden="true"></iconify-icon>
				{/if}
				<span class="text-xs font-medium">Save</span>
			</Button>
		</div>
	</div>

	<!-- Mobile Safe Area -->
	<div class="h-[env(safe-area-inset-bottom)] bg-surface-900"></div>

	<!-- Error Toast -->
	{#if imageEditorStore.state.error}
		<div
			class="absolute bottom-full inset-s-1/2 mb-4 -translate-x-1/2 flex items-center gap-2 rounded-full bg-error-500/95 px-5 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-sm"
			transition:fade={{ duration: 200 }}
		>
			<iconify-icon icon="mdi:alert-circle" width="18"></iconify-icon>
			<span>{imageEditorStore.state.error}</span>
			<button
				type="button"
				class="ms-2 rounded-full p-1 hover:bg-white/20"
				onclick={() => imageEditorStore.setError(null)}
				aria-label="Dismiss"
			>
				<iconify-icon icon="mdi:close" width="14"></iconify-icon>
			</button>
		</div>
	{/if}
</div>

<style>
	.editor-toolbar {
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	/* Mobile optimizations */
	@media (max-width: 640px) {
		.editor-toolbar {
			font-size: 0.875rem;
			border-radius: 1rem 1rem 0 0;
		}

		.footer-actions {
			justify-content: flex-start;
			padding-inline: 0.75rem;
			padding-block: 0.6rem;
		}

		.shortcut-hint {
			display: none;
		}

		.action-group {
			width: 100%;
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: 0.375rem;
		}

	}
</style>
