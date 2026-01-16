<!-- 
@file src/components/MediaLibraryModal.svelte
@component Media Library Selection Modal
-->

<script lang="ts">
	// Props interface (required for modal components)
	interface Props {
		close?: () => void;
	}
	const { close }: Props = $props();

	function handleClose() {
		console.log('[MediaLibraryModal] Closing modal');
		close?.();
	}
</script>

<div class="modal-media-library space-y-4">
	<header class="text-center text-primary-500 text-2xl font-bold">Media Library Modal Test</header>

	<article class="text-center text-sm">This is a simple test modal. If you can see this, the modal system is working!</article>

	<footer class="modal-footer flex justify-end gap-2">
		<button type="button" class="btn preset-ghost" onclick={handleClose}> Close </button>
	</footer>
</div>
