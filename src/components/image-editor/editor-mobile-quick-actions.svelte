<!--
@file src/components/image-editor/editor-mobile-quick-actions.svelte
@component
Contextual transform shortcuts — sits below top toolbar, above canvas (mobile only).
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';

	const storeState = imageEditorStore.state;
	const activeTool = $derived(imageEditorStore.state.activeState);
	const visible = $derived(
		!!storeState.imageElement && (activeTool === 'crop' || activeTool === 'rotate')
	);

	function handleRotateLeft() {
		storeState.rotation -= 90;
		imageEditorStore.takeSnapshot();
	}

	function handleFlipHorizontal() {
		storeState.flipH = !storeState.flipH;
		imageEditorStore.takeSnapshot();
	}

	function handleFlipVertical() {
		storeState.flipV = !storeState.flipV;
		imageEditorStore.takeSnapshot();
	}
</script>

{#if visible}
	<div class="editor-mobile-quick-actions" role="toolbar" aria-label="Transform quick actions">
		<button type="button" class="editor-mobile-quick-btn" onclick={handleRotateLeft} aria-label="Rotate left">
			<iconify-icon icon="mdi:rotate-left" width="17" aria-hidden="true"></iconify-icon>
		</button>
		<button type="button" class="editor-mobile-quick-btn" onclick={handleFlipHorizontal} aria-label="Flip horizontal">
			<iconify-icon icon="mdi:flip-horizontal" width="17" aria-hidden="true"></iconify-icon>
		</button>
		<button type="button" class="editor-mobile-quick-btn" onclick={handleFlipVertical} aria-label="Flip vertical">
			<iconify-icon icon="mdi:flip-vertical" width="17" aria-hidden="true"></iconify-icon>
		</button>
	</div>
{/if}
