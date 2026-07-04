<!--
@file src/components/image-editor/editor-mobile-toolbar.svelte
@component
Compact mobile top chrome — three-zone grid layout, pill groups, circular Done CTA.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';

	let {
		onclose = () => {},
		onsave,
		isSaving = false
	}: {
		onclose?: () => void;
		onsave: () => void;
		isSaving?: boolean;
	} = $props();

	const canUndo = $derived(imageEditorStore.canUndoState);
	const canRedo = $derived(imageEditorStore.canRedoState);
	const isComparing = $derived(imageEditorStore.compareSliderPosition > 0);

	function toggleCompare() {
		imageEditorStore.compareSliderPosition = imageEditorStore.compareSliderPosition > 0 ? 0 : 50;
	}
</script>

<header class="shrink-0 p-0 bg-transparent border-b-0" role="toolbar" aria-label="Image editor mobile">
	<div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center w-full min-h-[--editor-control-h]">
		<div class="flex gap-1.5 items-center justify-self-start min-h-[--editor-control-h]">
			<div class="editor-mobile-chrome-pill inline-flex gap-0 items-center h-[--editor-control-h] p-[--editor-pill-pad] rounded-full border border-[--editor-chrome-border] bg-white/[0.09] box-border">
				<button
					type="button"
					class="editor-mobile-icon-btn inline-flex items-center justify-center shrink-0 p-0 rounded-full bg-transparent cursor-pointer transition-[background,color,opacity] duration-150 border-none text-[rgba(255,255,255,0.94)] disabled:opacity-22 disabled:cursor-not-allowed hover:text-white hover:bg-white/10 [&_iconify-icon]:block [&_iconify-icon]:leading-[0]"
					style="width:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2);height:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2)"
					onclick={onclose}
					aria-label="Close editor"
				>
					<iconify-icon icon="mdi:close" width="17" aria-hidden="true"></iconify-icon>
				</button>
				<button
					type="button"
					class="editor-mobile-icon-btn inline-flex items-center justify-center shrink-0 p-0 rounded-full bg-transparent cursor-pointer transition-[background,color,opacity] duration-150 border-none text-[rgba(255,255,255,0.94)] disabled:opacity-22 disabled:cursor-not-allowed hover:text-white hover:bg-white/10 [&_iconify-icon]:block [&_iconify-icon]:leading-[0] {isComparing ? 'bg-white/12' : ''}"
					class:text-white={isComparing}
					style="width:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2);height:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2)"
					onclick={toggleCompare}
					aria-label="Compare before and after"
					aria-pressed={isComparing}
				>
					<iconify-icon icon="mdi:history" width="17" aria-hidden="true"></iconify-icon>
				</button>
			</div>
		</div>

		<div class="flex gap-1.5 items-center justify-self-center min-h-[--editor-control-h]">
			<div class="editor-mobile-chrome-pill inline-flex gap-0 items-center h-[--editor-control-h] p-[--editor-pill-pad] rounded-full border border-[--editor-chrome-border] bg-white/[0.09] box-border">
				<button
					type="button"
					class="editor-mobile-icon-btn inline-flex items-center justify-center shrink-0 p-0 rounded-full bg-transparent cursor-pointer transition-[background,color,opacity] duration-150 border-none text-[rgba(255,255,255,0.94)] disabled:opacity-22 disabled:cursor-not-allowed hover:text-white hover:bg-white/10 [&_iconify-icon]:block [&_iconify-icon]:leading-[0]"
					style="width:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2);height:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2)"
					onclick={() => imageEditorStore.handleUndo()}
					disabled={!canUndo}
					aria-label="Undo"
				>
					<iconify-icon icon="mdi:undo" width="17" aria-hidden="true"></iconify-icon>
				</button>
				<button
					type="button"
					class="editor-mobile-icon-btn inline-flex items-center justify-center shrink-0 p-0 rounded-full bg-transparent cursor-pointer transition-[background,color,opacity] duration-150 border-none text-[rgba(255,255,255,0.94)] disabled:opacity-22 disabled:cursor-not-allowed hover:text-white hover:bg-white/10 [&_iconify-icon]:block [&_iconify-icon]:leading-[0]"
					style="width:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2);height:calc(var(--editor-control-h) - var(--editor-pill-pad) * 2)"
					onclick={() => imageEditorStore.handleRedo()}
					disabled={!canRedo}
					aria-label="Redo"
				>
					<iconify-icon icon="mdi:redo" width="17" aria-hidden="true"></iconify-icon>
				</button>
			</div>
		</div>

		<div class="flex gap-1.5 items-center justify-self-end min-h-[--editor-control-h]">
			<button
				type="button"
				class="editor-mobile-done-round inline-flex items-center justify-center shrink-0 size-[--editor-control-h] p-0 text-[#111] cursor-pointer bg-[--editor-accent] border-none rounded-full shadow-none transition-[background,transform,opacity] duration-150 hover:not-disabled:bg-[--editor-accent-hover] active:not-disabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-65 [&_iconify-icon]:block [&_iconify-icon]:leading-[0] [&_iconify-icon]:text-[#111]"
				onclick={onsave}
				disabled={isSaving}
				aria-label="Save edited image"
			>
				{#if isSaving}
					<iconify-icon icon="mdi:loading" width="17" class="animate-spin" aria-hidden="true"></iconify-icon>
				{:else}
					<iconify-icon icon="mdi:check-bold" width="18" aria-hidden="true"></iconify-icon>
				{/if}
			</button>
		</div>
	</div>
</header>

<style>
	.editor-mobile-chrome-pill .editor-mobile-icon-btn + .editor-mobile-icon-btn {
		box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.12);
	}
</style>
