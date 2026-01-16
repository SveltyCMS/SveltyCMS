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
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import { modalState } from '@utils/modalState.svelte';

	// Handle closing via the Store
	function onClose() {
		modalState.close();
	}

	// Handle open change from the Dialog (e.g. clicking backdrop or pressing Escape)
	function onOpenChange(details: { open: boolean }) {
		if (!details.open) onClose();
	}
</script>

{#if modalState.isOpen && modalState.active}
	<Dialog open={true} {onOpenChange}>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-black/40 transition-opacity" />

		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content class="card w-full space-y-4 p-4 shadow-xl bg-surface-100-900 {modalState.active.props?.modalClasses ?? 'max-w-lg'}">
				{#if modalState.active.props?.title}
					<div class="flex items-center justify-between">
						<Dialog.Title class="h3 font-bold">
							{modalState.active.props.title}
						</Dialog.Title>
						<Dialog.CloseTrigger class="btn-icon btn-sm variant-soft hover:variant-filled">
							<iconify-icon icon="mingcute:close-fill"></iconify-icon>
						</Dialog.CloseTrigger>
					</div>
				{/if}

				{#if modalState.active.component}
					<div class="modal-body">
						<svelte:component this={modalState.active.component} {...modalState.active.props || {}} close={modalState.close.bind(modalState)} />
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Dialog>
{/if}
