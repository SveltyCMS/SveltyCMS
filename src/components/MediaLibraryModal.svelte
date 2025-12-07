<!-- 
@file src/components/MediaLibraryModal.svelte
@component Media Library Selection Modal - Simple Test Version
-->

<script lang="ts">
	import { getModalStore } from '@skeletonlabs/skeleton';
	
	// Props interface (required for modal components)
	interface Props {
		parent: any;
	}
	const { parent }: Props = $props();
	
	// Get modal store AFTER props
	const modalStore = getModalStore();

	function handleClose() {
		console.log('[MediaLibraryModal] Closing modal');
		modalStore.close();
	}
</script>

{#if $modalStore[0]}
	<div class="modal-media-library card p-4 w-modal shadow-xl space-y-4 bg-white dark:bg-surface-800">
		<header class="text-center text-primary-500 text-2xl font-bold">
			Media Library Modal Test
		</header>
		
		<article class="text-center text-sm">
			This is a simple test modal. If you can see this, the modal system is working!
		</article>

		<footer class="modal-footer flex justify-end gap-2 {parent.regionFooter}">
			<button 
				type="button" 
				class="btn {parent.buttonNeutral}" 
				onclick={handleClose}
			>
				Close
			</button>
		</footer>
	</div>
{/if}
