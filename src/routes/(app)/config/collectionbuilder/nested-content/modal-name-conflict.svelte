<!--
@file src/routes/(app)/config/collectionbuilder/ModalNameConflict.svelte
@component
**ModalNameConflict - This component displays a modal for resolving collection name conflicts.**

Features:
- Displays collection name conflicts
- Provides suggestions for resolving conflicts
-->
<script lang="ts">
	import { modalState } from '@utils/modal.svelte';
	import {
		button_cancel,
		modalnameconflict_custom_placeholder,
		modalnameconflict_heading,
		modalnameconflict_part1,
		modalnameconflict_part2,
		modalnameconflict_use_selected,
		modalnameconflict_validation
	} from '@src/paraglide/messages';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';

	interface Props {
		conflictingName: string;
		conflictPath: string;
		onConfirm: (name: string) => void;
		suggestions: string[];
	}

	let {
		conflictingName = $bindable(),
		conflictPath = $bindable(),
		suggestions = $bindable([]),
		onConfirm = $bindable(() => {})
	}: Props = $props();

	let selectedName = $state(suggestions[0] || ''); // Default to first suggestion
	let customName = $state('');
	let useCustomName = $state(false); // Controls whether custom name input is enabled

	// Handles the confirmation action. Chooses between selected suggested name or custom name
	function handleConfirm() {
		const newName = useCustomName ? customName : selectedName;
		if (newName && validateCustomName(newName)) {
			// Validate custom name even if not explicitly enabled
			modalState.close();
			onConfirm(newName); // Call the provided confirmation callback
		}
	}

	// Handles the cancel action, closing the modal without confirmation
	function handleCancel() {
		modalState.close();
	}

	/**
	 * Validates the format of a custom name.
	 * @param name The custom name to validate.
	 * @returns True if the name is valid, false otherwise.
	 */
	function validateCustomName(name: string): boolean {
		// Name must start with a letter and contain only letters and numbers
		return /^[a-zA-Z][a-zA-Z0-9]*$/.test(name);
	}

	const suggestionOptions = $derived(
		suggestions.map((suggestion) => ({ value: suggestion, label: suggestion }))
	);
</script>

<div class="modal-body p-4">
	<div
		class="alert bg-warning-500/10 text-warning-500 border border-warning-500/30 dark:bg-warning-500/20 dark:text-warning-400 dark:border-warning-500/40 rounded-lg p-4 mb-4"
	>
		<div class="alert-message">
			<h3 class="h3 font-bold">{modalnameconflict_heading()}</h3>
			<p class="text-sm">
				{modalnameconflict_part1()}<code class="font-bold">{conflictingName}</code
				>{modalnameconflict_part2()}
			</p>
			<code class="mt-2 block rounded bg-surface-900 text-white p-2 text-xs">{conflictPath}</code>
		</div>
	</div>

	<div class="mb-4">
		<Select
			label="Choose a suggested name"
			bind:value={selectedName}
			options={suggestionOptions}
			disabled={useCustomName}
		/>
	</div>

	<div class="mb-4 space-y-3">
		<Checkbox bind:checked={useCustomName} label="Or use a custom name" />
		<Input
			id="custom-name"
			bind:value={customName}
			disabled={!useCustomName}
			placeholder={modalnameconflict_custom_placeholder()}
		/>
		{#if useCustomName && customName && !validateCustomName(customName)}
			<p class="mt-1 text-sm text-error-500">
				{modalnameconflict_validation()}
			</p>
		{/if}
	</div>

	<footer class="modal-footer flex justify-end gap-4">
		<Button variant="outline" type="button" onclick={handleCancel}>{button_cancel()}</Button>
		<Button
			variant="tertiary"
			type="button"
			onclick={handleConfirm}
			disabled={useCustomName ? !validateCustomName(customName) : !selectedName}
		>
			{modalnameconflict_use_selected()}
		</Button>
	</footer>
</div>
