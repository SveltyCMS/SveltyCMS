<!-- @file src/components/system/dialog-manager.svelte @description DialogManager for handling modals features: [modal lifecycle management, backdrop/escape close support, fullscreen mode support] -->

<script lang="ts">
	import Modal from '@components/ui/modal.svelte';
	import { modalState } from '@utils/modal.svelte';

	// Bind open state to modalState
	let open = $state(false);

	$effect(() => {
		open = modalState.isOpen;
	});

	$effect(() => {
		// When Modal closes internally (backdrop/escape/close button), sync to store
		if (!open && modalState.isOpen) {
			modalState.close();
		}
	});

	/* Derived state */
	const title = $derived(modalState.active?.props?.title);
	const size = $derived(modalState.active?.props?.size || 'md');
	const modalClasses = $derived(modalState.active?.props?.modalClasses ?? '');
	const ActiveComponent = $derived(modalState.active?.component);
	const props = $derived(modalState.active?.props || {});
</script>

<Modal bind:open {title} {size} class={modalClasses}>
	{#if ActiveComponent}
		<div class="modal-body {size === 'fullscreen' ? 'flex-1 overflow-hidden flex flex-col' : ''}">
			<ActiveComponent {...props} close={modalState.close.bind(modalState)} />
		</div>
	{/if}
</Modal>
