<!--
@file src/components/collection-display/bulk-field-edit-modal.svelte
@component
**Bulk field edit modal for batch-updating selected collection entries.**

### Features:
- Select from collection schema fields to bulk edit
- Automatic input type resolution (text, number, boolean, date)
- Batch-applies values across all selected entries
- Real-time validation and confirmation
- Accessible ARIA dialog with Escape to close
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import type { FieldDefinition, FieldInstance } from '@src/content/types';
	import { getFieldName } from '@utils/schema/field-utils';

	interface Props {
		isOpen?: boolean;
		selectedCount: number;
		/**
		 * Schema fields to offer for bulk editing: compiled `FieldInstance` entries or
		 * raw `FieldDefinition` entries (collection schemas may hold placeholders/join
		 * fields). Only the display keys below are read.
		 */
		fields?: readonly (FieldInstance | FieldDefinition)[];
		onApply: (updates: Record<string, unknown>) => Promise<void> | void;
		onClose: () => void;
	}

	let {
		isOpen = $bindable(false),
		selectedCount = 0,
		fields = [],
		onApply,
		onClose
	}: Props = $props();

	const SYSTEM_KEYS = new Set([
		'_id',
		'createdAt',
		'updatedAt',
		'createdBy',
		'updatedBy',
		'status',
		'_scheduled',
		'version',
		'revisions'
	]);

	// Filter schema to user-editable fields
	const editableFields = $derived.by(() => {
		if (!Array.isArray(fields)) return [];
		return fields
			.map((f) => {
				const typed = f as {
					db_fieldName?: string;
					label?: string;
					widget?: { Name?: string };
					type?: string;
				};
				const name = typed.db_fieldName || getFieldName(f as FieldInstance, false);
				const label = typed.label || name;
				const widgetName = (typed.widget?.Name || typed.type || 'input').toLowerCase();
				return { name, label, widgetName, raw: f };
			})
			.filter((f) => f.name && !SYSTEM_KEYS.has(f.name));
	});

	const fieldOptions = $derived(
		editableFields.map((f) => ({
			value: f.name,
			label: `${f.label} (${f.name})`
		}))
	);

	let selectedFieldName = $state<string>('');
	let fieldValueText = $state<string>('');
	let fieldValueNumber = $state<number | null>(null);
	let fieldValueBoolean = $state<boolean>(false);
	let isSubmitting = $state<boolean>(false);

	// Select first editable field on open
	$effect(() => {
		if (isOpen && editableFields.length > 0 && !selectedFieldName) {
			selectedFieldName = editableFields[0].name;
		}
	});

	const activeField = $derived(editableFields.find((f) => f.name === selectedFieldName) || null);

	const isBooleanField = $derived(
		activeField?.widgetName === 'checkbox' || activeField?.widgetName === 'boolean'
	);

	const isNumberField = $derived(
		activeField?.widgetName === 'number' ||
			activeField?.widgetName === 'currency' ||
			activeField?.widgetName === 'price'
	);

	const isDateField = $derived(
		activeField?.widgetName === 'date' || activeField?.widgetName === 'datetime'
	);

	const canSubmit = $derived.by(() => {
		if (!activeField) return false;
		if (isBooleanField) return true;
		if (isNumberField) return fieldValueNumber !== null && !isNaN(fieldValueNumber);
		return fieldValueText.trim().length > 0;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeModal();
		}
	}

	function closeModal() {
		isOpen = false;
		fieldValueText = '';
		fieldValueNumber = null;
		fieldValueBoolean = false;
		onClose();
	}

	async function handleSubmit(e?: Event) {
		if (e) e.preventDefault();
		if (!canSubmit || isSubmitting || !activeField) return;

		isSubmitting = true;
		try {
			let value: unknown;
			if (isBooleanField) {
				value = fieldValueBoolean;
			} else if (isNumberField) {
				value = Number(fieldValueNumber);
			} else {
				value = fieldValueText;
			}

			await onApply({ [activeField.name]: value });
			closeModal();
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeModal();
		}}
		onkeydown={handleKeydown}
	>
		<AdminCard
			class="w-full max-w-md space-y-4 border border-surface-500/30 bg-white p-6 shadow-2xl dark:border-surface-500/40 dark:bg-surface-800"
			role="dialog"
			aria-modal="true"
			aria-labelledby="bulk-edit-title"
		>
			<header class="space-y-1">
				<h3 id="bulk-edit-title" class="text-lg font-bold text-tertiary-500 dark:text-primary-500">
					Bulk Edit Entries
				</h3>
				<p class="text-xs text-surface-500 dark:text-surface-400">
					Updating <span class="font-bold text-tertiary-500 dark:text-primary-500"
						>{selectedCount}</span
					>
					selected {selectedCount === 1 ? 'entry' : 'entries'}.
				</p>
			</header>

			<form class="space-y-4" onsubmit={handleSubmit}>
				{#if editableFields.length > 0}
					<Select label="Target Field" bind:value={selectedFieldName} options={fieldOptions} />

					{#if activeField}
						<div class="space-y-1">
							{#if isBooleanField}
								<Checkbox bind:checked={fieldValueBoolean} label={activeField.label} />
							{:else if isNumberField}
								<Input
									type="number"
									label={`New value for ${activeField.label}`}
									bind:value={fieldValueNumber}
									required
									placeholder="Enter number..."
								/>
							{:else if isDateField}
								<Input
									type="date"
									label={`New value for ${activeField.label}`}
									bind:value={fieldValueText}
									required
								/>
							{:else}
								<Input
									type="text"
									label={`New value for ${activeField.label}`}
									bind:value={fieldValueText}
									required
									placeholder="Enter new value..."
								/>
							{/if}
						</div>
					{/if}
				{:else}
					<div class="p-4 text-center text-sm text-surface-500">
						No editable fields found in this collection schema.
					</div>
				{/if}

				<footer class="flex items-center justify-end gap-3 pt-2">
					<Button variant="outline" type="button" onclick={closeModal} disabled={isSubmitting}>
						Cancel
					</Button>
					<Button
						variant="tertiary"
						type="submit"
						disabled={!canSubmit || isSubmitting}
						class="dark:preset-filled-primary-500"
					>
						{#if isSubmitting}
							Updating...
						{:else}
							Apply to {selectedCount} {selectedCount === 1 ? 'item' : 'items'}
						{/if}
					</Button>
				</footer>
			</form>
		</AdminCard>
	</div>
{/if}
