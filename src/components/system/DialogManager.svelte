<!--
@file src/components/system/DialogManager.svelte
@description Global dialog manager component for Skeleton v4

This component renders all active dialogs from the dialogState store.
Include this once in your root layout.

Usage in +layout.svelte:
```svelte
<script>
	import DialogManager from '@components/system/DialogManager.svelte';
</script>

<DialogManager />
```
-->

<script lang="ts">
	import { dialogState, type DialogConfig } from '@utils/dialogState.svelte';

	// Handle clicking the backdrop
	function handleBackdropClick(dialog: DialogConfig) {
		if (dialog.type === 'confirm') {
			dialogState.handleCancel(dialog.id);
		} else {
			dialogState.close(dialog.id);
		}
	}

	// Handle escape key
	function handleEscapeKey(dialog: DialogConfig) {
		if (dialog.type === 'confirm') {
			dialogState.handleCancel(dialog.id);
		} else {
			dialogState.close(dialog.id);
		}
	}
</script>

{#each dialogState.dialogs as dialog (dialog.id)}
	{#if dialog.open}
		<!-- Custom dialog implementation without Skeleton Dialog (which requires trigger-based interaction) -->
		<div class="fixed inset-0 z-50">
			<!-- Backdrop -->
			<button
				type="button"
				class="fixed inset-0 bg-surface-900/50 backdrop-blur-sm"
				onclick={() => handleBackdropClick(dialog)}
				onkeydown={(e) => e.key === 'Escape' && handleEscapeKey(dialog)}
				aria-label="Close dialog"
			></button>

			<!-- Dialog Content -->
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div 
					class="w-full max-w-md rounded-container bg-surface-100 p-6 shadow-xl dark:bg-surface-800"
					role="dialog"
					aria-modal="true"
					aria-labelledby="dialog-title-{dialog.id}"
				>
					{#if dialog.title}
						<h2 id="dialog-title-{dialog.id}" class="mb-2 text-xl font-bold text-surface-900 dark:text-surface-50">
							{@html dialog.title}
						</h2>
					{/if}

					{#if dialog.description}
						<p class="mb-6 text-surface-700 dark:text-surface-300">
							{@html dialog.description}
						</p>
					{/if}

					{#if dialog.type === 'component' && dialog.component}
						<div class="mb-6">
							<svelte:component
								this={dialog.component}
								{...dialog.componentProps}
								onClose={(result: any) => {
									dialog.onClose?.(result);
									dialogState.close(dialog.id);
								}}
							/>
						</div>
					{/if}

					<!-- Dialog actions -->
					<div class="flex justify-end gap-3">
						{#if dialog.type === 'confirm'}
							<button
								type="button"
								class="btn {dialog.cancelClasses || 'preset-filled-surface-500'}"
								onclick={() => dialogState.handleCancel(dialog.id)}
							>
								{dialog.cancelText || 'Cancel'}
							</button>
							<button
								type="button"
								class="btn {dialog.confirmClasses || 'preset-filled-primary-500'}"
								onclick={() => dialogState.handleConfirm(dialog.id)}
							>
								{dialog.confirmText || 'Confirm'}
							</button>
						{:else if dialog.type === 'alert'}
							<button
								type="button"
								class="btn preset-filled-primary-500"
								onclick={() => dialogState.close(dialog.id)}
							>
								{dialog.confirmText || 'OK'}
							</button>
						{:else}
							<button
								type="button"
								class="btn preset-filled-surface-500"
								onclick={() => dialogState.close(dialog.id)}
							>
								Close
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
{/each}
