<!-- @file src/components/system/dialog-manager.svelte @description DialogManager for handling modals features: [modal lifecycle management, backdrop/escape close support, fullscreen mode support] -->

<script lang="ts">
	import { modalState } from '@utils/modal.svelte';

	const dialogTitleId = 'system-dialog-title';

	function onClose() {
		modalState.close();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && modalState.isOpen) {
			onClose();
		}
	}

	const isFullscreen = $derived(modalState.active?.props?.size === 'fullscreen');
</script>

<svelte:window onkeydown={handleKeydown} />

{#if modalState.isOpen}
	<div
		class="fixed inset-0 z-50"
		role="dialog"
		aria-modal="true"
		aria-labelledby={modalState.active?.props?.title ? dialogTitleId : undefined}
	>
		<button
			type="button"
			class="fixed inset-0 z-50 bg-surface-900/40 backdrop-blur-sm transition-opacity"
			aria-label="Close dialog"
			onclick={onClose}
		></button>

		<div class="fixed inset-0 z-50 flex items-center justify-center {isFullscreen ? 'p-0' : 'p-4'} pointer-events-none">
			<section
				class="card pointer-events-auto w-full border border-surface-300 bg-surface-100-900 shadow-xl dark:border-surface-50
				{isFullscreen ? 'flex h-full flex-col rounded-none border-0' : 'space-y-4 p-4'}
				{modalState.active?.props?.modalClasses ?? 'max-w-lg'}"
			>
				{#if modalState.active}
					{#if modalState.active.props?.title}
						<div class="flex items-center justify-between {isFullscreen ? 'border-b border-surface-200 p-4 dark:border-surface-700' : ''}">
							<h2 id={dialogTitleId} class="h3 font-bold">{modalState.active.props.title}</h2>
							<button type="button" class="btn-icon btn-sm preset-tonal hover:variant-filled" aria-label="Close dialog" onclick={onClose}>
								<iconify-icon icon="mingcute:close-fill"></iconify-icon>
							</button>
						</div>
					{/if}

					{#if modalState.active.component}
						{@const ActiveComponent = modalState.active.component}
						<div class="modal-body {isFullscreen ? 'flex flex-1 flex-col overflow-hidden' : ''}">
							<ActiveComponent {...modalState.active.props || {}} close={modalState.close.bind(modalState)} />
						</div>
					{/if}
				{/if}
			</section>
		</div>
	</div>
{/if}