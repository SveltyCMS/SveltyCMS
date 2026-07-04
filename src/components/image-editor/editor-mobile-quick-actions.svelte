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
		<div class="grid shrink-0 grid-cols-3 gap-0 items-center justify-items-center w-full max-w-48 mx-auto py-0.5 pb-1 bg-transparent border-b-0 [&_iconify-icon]:block [&_iconify-icon]:leading-[0]" role="toolbar" aria-label="Transform quick actions">
		<button type="button" class="inline-flex items-center justify-center size-8 p-0 text-[rgba(255,255,255,0.94)] cursor-pointer bg-transparent border-none rounded-full transition-[color,opacity] duration-150 hover:text-white active:opacity-72" onclick={handleRotateLeft} aria-label="Rotate left">
			<iconify-icon icon="mdi:rotate-left" width="17" aria-hidden="true"></iconify-icon>
		</button>
		<button type="button" class="inline-flex items-center justify-center size-8 p-0 text-[rgba(255,255,255,0.94)] cursor-pointer bg-transparent border-none rounded-full transition-[color,opacity] duration-150 hover:text-white active:opacity-72" onclick={handleFlipHorizontal} aria-label="Flip horizontal">
			<iconify-icon icon="mdi:flip-horizontal" width="17" aria-hidden="true"></iconify-icon>
		</button>
		<button type="button" class="inline-flex items-center justify-center size-8 p-0 text-[rgba(255,255,255,0.94)] cursor-pointer bg-transparent border-none rounded-full transition-[color,opacity] duration-150 hover:text-white active:opacity-72" onclick={handleFlipVertical} aria-label="Flip vertical">
			<iconify-icon icon="mdi:flip-vertical" width="17" aria-hidden="true"></iconify-icon>
		</button>
	</div>
{/if}
