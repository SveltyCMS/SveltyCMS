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

<header class="editor-mobile-toolbar" role="toolbar" aria-label="Image editor mobile">
	<div class="editor-chrome-toolbar editor-mobile-toolbar-row">
		<div class="editor-chrome-zone-start">
			<div class="editor-chrome-pill">
				<button type="button" class="editor-chrome-icon-btn" onclick={onclose} aria-label="Close editor">
					<iconify-icon icon="mdi:close" width="17" aria-hidden="true"></iconify-icon>
				</button>
				<button
					type="button"
					class="editor-chrome-icon-btn"
					class:editor-chrome-icon-btn-active={isComparing}
					onclick={toggleCompare}
					aria-label="Compare before and after"
					aria-pressed={isComparing}
				>
					<iconify-icon icon="mdi:history" width="17" aria-hidden="true"></iconify-icon>
				</button>
			</div>
		</div>

		<div class="editor-chrome-zone-center">
			<div class="editor-chrome-pill">
				<button
					type="button"
					class="editor-chrome-icon-btn"
					onclick={() => imageEditorStore.handleUndo()}
					disabled={!canUndo}
					aria-label="Undo"
				>
					<iconify-icon icon="mdi:undo" width="17" aria-hidden="true"></iconify-icon>
				</button>
				<button
					type="button"
					class="editor-chrome-icon-btn"
					onclick={() => imageEditorStore.handleRedo()}
					disabled={!canRedo}
					aria-label="Redo"
				>
					<iconify-icon icon="mdi:redo" width="17" aria-hidden="true"></iconify-icon>
				</button>
			</div>
		</div>

		<div class="editor-chrome-zone-end">
			<button
				type="button"
				class="editor-chrome-done editor-chrome-done-round"
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
