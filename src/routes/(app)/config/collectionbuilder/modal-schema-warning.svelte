<!--
@file src/routes/(app)/config/collectionbuilder/ModalSchemaWarning.svelte
@component
**Schema Warning Modal - Data Loss Prevention**

Displays breaking changes detected when saving a collection schema.
Requires user confirmation before proceeding with changes that may cause data loss.

@props
- `breakingChanges` {BreakingChange[]} - List of breaking changes detected
- `collectionName` {string} - Name of the collection being modified
- `onConfirm` {() => void} - Callback when user confirms changes
- `onCancel` {() => void} - Callback when user cancels

@features
- Data loss warnings highlighted in red
- Other breaking changes in yellow
- Checkbox confirmation for data loss
- Suggestions for each change
- Accessible with proper ARIA labels
-->

<script lang="ts">
	import type { BreakingChange } from '@utils/collection-schema-warnings';
	import {
		button_cancel,
		builder_warning_cannot_recover,
		builder_warning_collection_label,
		builder_warning_confirm_aria,
		builder_warning_confirm_text,
		builder_warning_data_loss_plural,
		builder_warning_data_loss_singular,
		builder_warning_other_plural,
		builder_warning_other_singular
	} from '@src/paraglide/messages';
	import { fade, slide } from 'svelte/transition';

	interface Props {
		breakingChanges: BreakingChange[];
		collectionName: string;
		onCancel: () => void;
		onConfirm: () => void;
	}

	let { breakingChanges, collectionName, onConfirm, onCancel }: Props = $props();

	// Separate data loss changes from other breaking changes
	const dataLossChanges = $derived(breakingChanges.filter((c) => c.dataLoss));
	const otherChanges = $derived(breakingChanges.filter((c) => !c.dataLoss));
	const hasDataLoss = $derived(dataLossChanges.length > 0);

	// Confirmation checkbox state (required for data loss)
	let confirmed = $state(false);
	const canProceed = $derived(!hasDataLoss || confirmed);

	// Icon mapping for change types
	const typeIcons: Record<string, string> = {
		field_removed: 'mdi:database-remove',
		field_renamed: 'mdi:form-textbox',
		type_changed: 'mdi:swap-horizontal',
		required_added: 'mdi:asterisk',
		unique_added: 'mdi:key-variant'
	};

	function handleConfirm() {
		if (canProceed) {
			onConfirm();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
	transition:fade={{ duration: 200 }}
	role="dialog"
	aria-modal="true"
	aria-labelledby="modal-title"
>
	<!-- Modal -->
	<div
		class="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded bg-surface-500/10 shadow-2xl dark:bg-surface-800"
		transition:slide={{ duration: 200 }}
	>
		<!-- Header -->
		<div class="flex items-center gap-3 border-b border-surface-500/30 p-4 dark:border-surface-600">
			<div class={hasDataLoss ? 'text-error-500' : 'text-warning-500'}>
				<iconify-icon icon="mdi:alert-circle" width={28}></iconify-icon>
			</div>
			<div>
				<h2 id="modal-title" class="text-lg font-bold text-surface-900 dark:text-white">
					{hasDataLoss ? 'Data Loss Warning' : 'Breaking Changes Detected'}
				</h2>
				<p class="text-sm text-surface-600 dark:text-surface-50">
					{builder_warning_collection_label()}{' '}<span class="font-medium">{collectionName}</span>
				</p>
			</div>
		</div>

		<!-- Content -->
		<div class="space-y-4 p-4">
			{#if dataLossChanges.length > 0}
				<div class="rounded border-2 border-error-500/30 bg-error-500/10 p-3">
					<p class="mb-2 flex items-center gap-2 font-semibold text-error-600 dark:text-error-500">
						<iconify-icon icon="mdi:database-alert" width={24}></iconify-icon>
						{dataLossChanges.length > 1
							? builder_warning_data_loss_plural({ count: dataLossChanges.length })
							: builder_warning_data_loss_singular({ count: dataLossChanges.length })}
					</p>
					<ul class="space-y-2">
						{#each dataLossChanges as change (change.type + change.message)}
							<li class="flex items-start gap-2 text-sm">
								<iconify-icon
									icon={typeIcons[change.type || 'mdi:alert']}
									width="18"
									class="mt-0.5 text-error-500"
								></iconify-icon>
								<div>
									<p class="text-surface-600 dark:text-surface-400">{change.message}</p>
									{#if change.suggestion}
										<p class="mt-1 text-xs text-surface-600 dark:text-surface-50">
											<iconify-icon icon="mdi:lightbulb-outline" width={24}></iconify-icon>
											{change.suggestion}
										</p>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if otherChanges.length > 0}
				<div class="rounded border-2 border-warning-500/30 bg-warning-500/10 p-3">
					<p
						class="mb-2 flex items-center gap-2 font-semibold text-warning-600 dark:text-warning-400"
					>
						<iconify-icon icon="mdi:alert" width={20}></iconify-icon>
						{otherChanges.length > 1
							? builder_warning_other_plural({ count: otherChanges.length })
							: builder_warning_other_singular({ count: otherChanges.length })}
					</p>
					<ul class="space-y-2">
						{#each otherChanges as change (change.type + change.message)}
							<li class="flex items-start gap-2 text-sm">
								<iconify-icon
									icon={typeIcons[change.type || 'mdi:alert']}
									width="18"
									class="mt-0.5 text-warning-500"
								></iconify-icon>
								<div>
									<p class="text-surface-600 dark:text-surface-400">{change.message}</p>
									{#if change.suggestion}
										<p class="mt-1 text-xs text-surface-600 dark:text-surface-50">
											<iconify-icon icon="mdi:lightbulb-outline" width={24}></iconify-icon>
											{change.suggestion}
										</p>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Confirmation checkbox for data loss -->
			{#if hasDataLoss}
				<label
					class="flex cursor-pointer items-start gap-3 rounded bg-surface-200/50 p-3 dark:bg-surface-700/50"
				>
					<input
						aria-label={builder_warning_confirm_aria()}
						type="checkbox"
						bind:checked={confirmed}
						class="mt-1 h-5 w-5 cursor-pointer rounded border-surface-500 text-error-500 focus:ring-error-500"
						aria-describedby="confirm-description"
					/>
					<div>
						<span class="font-medium text-surface-900 dark:text-white">
							{builder_warning_confirm_text()}
						</span>
						<p id="confirm-description" class="mt-1 text-sm text-surface-600 dark:text-surface-50">
							{builder_warning_cannot_recover()}
						</p>
					</div>
				</label>
			{/if}
		</div>

		<!-- Footer -->
		<div class="flex justify-end gap-3 border-t border-surface-500/30 p-4 dark:border-surface-600">
			<button
				type="button"
				onclick={onCancel}
				class="rounded border border-surface-500/30 bg-white px-4 py-2 font-medium text-surface-700 transition-colors hover:bg-surface-500/10 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600"
			>
				{button_cancel()}
			</button>
			<button
				type="button"
				onclick={handleConfirm}
				disabled={!canProceed}
				class="rounded px-4 py-2 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50
					{hasDataLoss ? 'bg-error-500 hover:bg-error-600' : 'bg-warning-500 hover:bg-warning-600'}"
				aria-disabled={!canProceed}
			>
				{hasDataLoss ? 'Confirm & Delete Data' : 'Proceed with Changes'}
			</button>
		</div>
	</div>
</div>
