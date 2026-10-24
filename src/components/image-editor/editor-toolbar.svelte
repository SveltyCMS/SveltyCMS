<!--
@file: src/components/image-editor/editor-toolbar.svelte
@component
**Pintura-style professional top toolbar**

Three-zone grid: compare (start), undo/redo + zoom (center), Done (end).
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { imageEditorStore } from '@components/image-editor/image-editor-store.svelte';
	import Slot from '@src/components/system/slot.svelte';

	let {
		onsave,
		onclose,
		isSaving,
		onZoomIn = () => {},
		onZoomOut = () => {},
		onZoomReset = () => {}
	}: {
		onsave: () => void;
		onclose?: () => void;
		isSaving: boolean;
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onZoomReset?: () => void;
	} = $props();

	const canUndo = $derived(imageEditorStore.canUndoState);
	const canRedo = $derived(imageEditorStore.canRedoState);
	const isDirty = $derived(imageEditorStore.isDirty);
	const isComparing = $derived(imageEditorStore.compareSliderPosition > 0);
	const zoomPercent = $derived(Math.round(imageEditorStore.state.zoom * 100));

	function toggleCompare() {
		imageEditorStore.compareSliderPosition = imageEditorStore.compareSliderPosition > 0 ? 0 : 50;
	}
</script>

<header
	class="editor-toolbar editor-glass-bar relative z-30 shrink-0 px-4 py-2 bg-(--editor-chrome-bg) border-b border-(--editor-chrome-border)"
	role="toolbar"
	aria-label="Image editor"
>
	<div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center w-full min-h-(--editor-control-h)">
		<div class="flex gap-1.5 items-center justify-self-start">
			<Slot name="image_editor_tool" inline />
			<button
				type="button"
				class="editor-toolbar-solo-btn inline-flex items-center justify-center size-(--editor-control-h) cursor-pointer bg-(--editor-chrome-elevated) border border-(--editor-chrome-border) rounded-(--editor-radius-control) transition-[background,color,border-color] duration-150 text-(--editor-chrome-text) hover:text-(--editor-chrome-text-hover) hover:bg-(--editor-chrome-elevated)"
				class:editor-toolbar-solo-btn-active={isComparing}
				onclick={toggleCompare}
				title="Compare before / after (\)"
				aria-pressed={isComparing}
				aria-label="Toggle compare mode"
				aria-keyshortcuts="\\"
			>
				<iconify-icon icon="mdi:compare-horizontal" width="18" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="flex gap-1.5 items-center justify-self-center">
			<div
				class="inline-flex gap-0.5 items-center px-0.75 py-0.5 rounded-full border border-(--editor-chrome-border) bg-(--editor-chrome-elevated)"
			>
				<button
					type="button"
					class="inline-flex items-center justify-center size-(--editor-control-h) p-0 text-(--editor-chrome-text) cursor-pointer bg-transparent border-none rounded-full transition-[background,color,opacity] duration-150 hover:not-disabled:text-(--editor-chrome-text-hover) hover:not-disabled:bg-(--editor-chrome-elevated) disabled:cursor-not-allowed disabled:opacity-28"
					onclick={() => imageEditorStore.handleUndo()}
					disabled={!canUndo}
					title="Undo (Mod+Z)"
					aria-label="Undo last change"
					aria-keyshortcuts="Mod+Z"
				>
					<iconify-icon icon="mdi:undo" width="18" aria-hidden="true"></iconify-icon>
				</button>
				<button
					type="button"
					class="inline-flex items-center justify-center size-(--editor-control-h) p-0 text-(--editor-chrome-text) cursor-pointer bg-transparent border-none rounded-full transition-[background,color,opacity] duration-150 hover:not-disabled:text-(--editor-chrome-text-hover) hover:not-disabled:bg-(--editor-chrome-elevated) disabled:cursor-not-allowed disabled:opacity-28"
					onclick={() => imageEditorStore.handleRedo()}
					disabled={!canRedo}
					title="Redo (Mod+Shift+Z)"
					aria-label="Redo last undone change"
					aria-keyshortcuts="Mod+Shift+Z"
				>
					<iconify-icon icon="mdi:redo" width="18" aria-hidden="true"></iconify-icon>
				</button>

				<div
					class="editor-toolbar-divider shrink-0 w-px h-5 mx-0.5 bg-(--editor-chrome-border)"
					aria-hidden="true"
				></div>

				<div
					class="zoom-pill inline-flex items-center overflow-hidden bg-transparent border-none rounded-full"
					style="height:calc(var(--editor-control-h, 2.25rem) - 0.25rem)"
					role="group"
					aria-label="Zoom controls"
				>
					<button
						type="button"
						class="zoom-pill-btn inline-flex items-center justify-center w-7 h-full cursor-pointer bg-transparent border-none transition-[background,color] duration-150 text-(--editor-chrome-text) hover:text-(--editor-chrome-text-active) hover:bg-(--editor-chrome-elevated) hover:rounded-full"
						onclick={onZoomOut}
						title="Zoom out (-)"
						aria-label="Zoom out"
						aria-keyshortcuts="-"
					>
						<iconify-icon icon="mdi:minus" width="15" aria-hidden="true"></iconify-icon>
					</button>
					<button
						type="button"
						class="zoom-pill-value min-w-12 px-1 text-xs font-medium tabular-nums text-center cursor-pointer bg-transparent border-none border-x border-(--editor-chrome-border-subtle) text-(--editor-chrome-text-hover) hover:bg-(--editor-chrome-elevated) hover:rounded"
						onclick={onZoomReset}
						title="Fit image (Mod+0). Actual size is Mod+1"
						aria-label="Fit image in view"
						aria-keyshortcuts="Mod+0"
					>
						{zoomPercent}%
					</button>
					<button
						type="button"
						class="zoom-pill-btn inline-flex items-center justify-center w-7 h-full cursor-pointer bg-transparent border-none transition-[background,color] duration-150 text-(--editor-chrome-text) hover:text-(--editor-chrome-text-active) hover:bg-(--editor-chrome-elevated) hover:rounded-full"
						onclick={onZoomIn}
						title="Zoom in (+)"
						aria-label="Zoom in"
						aria-keyshortcuts="+"
					>
						<iconify-icon icon="mdi:plus" width="15" aria-hidden="true"></iconify-icon>
					</button>
				</div>
			</div>
		</div>

		<div class="flex gap-2 items-center justify-self-end">
			{#if onclose}
				<button
					type="button"
					class="editor-toolbar-solo-btn inline-flex items-center justify-center size-(--editor-control-h) cursor-pointer bg-(--editor-chrome-elevated) border border-(--editor-chrome-border) rounded-(--editor-radius-control) transition-[background,color,border-color] duration-150 text-(--editor-chrome-text) hover:text-(--editor-chrome-text-hover) hover:bg-(--editor-chrome-elevated)"
					onclick={onclose}
					title="Close editor (Esc)"
					aria-label="Close image editor"
					aria-keyshortcuts="Escape"
				>
					<iconify-icon icon="mdi:close" width="20" aria-hidden="true"></iconify-icon>
				</button>
			{/if}

			<button
				type="button"
				class="inline-flex gap-1.5 items-center justify-center min-w-20 h-(--editor-control-h) px-4 text-[13px] font-semibold tracking-[0.01em] cursor-pointer rounded-(--editor-radius-control) shadow-xs transition-[background,color,transform,opacity] duration-150 active:not-disabled:scale-[0.98] disabled:cursor-not-allowed {isDirty
					? 'bg-(--editor-accent) text-white hover:bg-(--editor-accent-hover)'
					: 'bg-(--editor-chrome-elevated) text-(--editor-chrome-text) border border-(--editor-chrome-border) opacity-50'}"
				onclick={onsave}
				disabled={isSaving || !isDirty}
				title={isDirty ? 'Save changes (Mod+S)' : 'No changes to save'}
				aria-label="Save edited image"
				aria-keyshortcuts="Mod+S"
			>
				{#if isSaving}
					<iconify-icon icon="mdi:loading" width="16" class="animate-spin" aria-hidden="true"
					></iconify-icon>
				{:else}
					<iconify-icon icon="mdi:content-save-outline" width="16" aria-hidden="true"
					></iconify-icon>
				{/if}
				<span>Save</span>
			</button>
		</div>
	</div>

	{#if imageEditorStore.state.error}
		<div
			class="editor-toolbar-error absolute inset-s-1/2 top-[calc(100%+0.375rem)] z-50 flex gap-2 items-center px-3 py-[0.4rem] text-[13px] font-medium text-white whitespace-nowrap bg-error-500 rounded-full shadow-lg -translate-x-1/2"
			transition:fade={{ duration: 200 }}
			role="alert"
		>
			<iconify-icon icon="mdi:alert-circle" width="16" aria-hidden="true"></iconify-icon>
			<span>{imageEditorStore.state.error}</span>
			<button
				type="button"
				class="editor-toolbar-error-dismiss inline-flex p-0.5 text-inherit cursor-pointer bg-transparent border-none rounded-full opacity-85 hover:opacity-100 hover:bg-white/15"
				onclick={() => imageEditorStore.setError(null)}
				aria-label="Dismiss error"
			>
				<iconify-icon icon="mdi:close" width="14" aria-hidden="true"></iconify-icon>
			</button>
		</div>
	{/if}
</header>

<style>
	.editor-toolbar-solo-btn-active {
		color: var(--editor-chrome-text-active, #fff);
		background: var(--editor-chrome-elevated, rgba(255, 255, 255, 0.12));
		border-color: var(--editor-chrome-border, rgba(255, 255, 255, 0.14));
	}
</style>
