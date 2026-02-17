<!--
@files src/components/system/DialogManager.svelte
@component 
**DialogManager for handling modals**

### Props
- `modalState` 

### Features
- Handles opening and closing modals
- Closes modals on backdrop click or Escape key press	

-->

<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { modalState } from '@utils/modalState.svelte';
	import { tick } from 'svelte';

	// Handle closing via the Store
	function onClose() {
		modalState.close();
	}

	// Handle open change from the Dialog (e.g. clicking backdrop or pressing Escape)
	async function onOpenChange(details: { open: boolean }) {
		if (!details.open) {
			await tick();
			onClose();
		}
	}
	/* Derived state for fullscreen mode */
	const isFullscreen = $derived(modalState.active?.props?.size === 'fullscreen');
</script>

<Dialog open={modalState.isOpen} {onOpenChange}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-black/40 transition-opacity" />

		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center {isFullscreen ? 'p-0' : 'p-4'}">
			<Dialog.Content
				class="card w-full shadow-xl bg-surface-100-900 border border-surface-300 dark:border-surface-50 
				{isFullscreen ? 'h-full rounded-none border-0 flex flex-col' : 'space-y-4 p-4'} 
				{modalState.active?.props?.modalClasses ?? 'max-w-lg'}"
			>
				{#if modalState.active}
					{#if modalState.active.props?.title}
						<div class="flex items-center justify-between {isFullscreen ? 'p-4 border-b border-surface-200 dark:border-surface-700' : ''}">
							<Dialog.Title class="h3 font-bold"> {modalState.active.props.title} </Dialog.Title>
							<Dialog.CloseTrigger class="btn-icon btn-sm preset-tonal hover:variant-filled" aria-label="Close dialog">
								<iconify-icon icon="mingcute:close-fill"></iconify-icon>
							</Dialog.CloseTrigger>
						</div>
					{/if}

					{#if modalState.active.component}
						{@const ActiveComponent = modalState.active.component}
						<div class="modal-body {isFullscreen ? 'flex-1 overflow-hidden flex flex-col' : ''}">
							<ActiveComponent {...modalState.active.props || {}} close={modalState.close.bind(modalState)} />
						</div>
					{/if}
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
