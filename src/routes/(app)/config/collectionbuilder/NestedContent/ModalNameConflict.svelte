<!--
@file src/routes/(app)/config/collectionbuilder/ModalNameConflict.svelte
@component 
**ModalNameConflict - This component displays a modal for resolving collection name conflicts.**

Features:
- Displays collection name conflicts
- Provides suggestions for resolving conflicts
-->
<script lang="ts">
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	interface Props {
		conflictingName: string;
		conflictPath: string;
		suggestions: string[];
		onConfirm: (name: string) => void;
	}

	let { conflictingName = $bindable(), conflictPath = $bindable(), suggestions = $bindable([]), onConfirm = $bindable(() => {}) }: Props = $props();

	let selectedName = $state(suggestions[0] || '');
	let customName = $state('');
	let useCustomName = $state(false);

	function handleConfirm() {
		const newName = useCustomName ? customName : selectedName;
		if (newName) {
			modalStore.close();
			onConfirm(newName);
		}
	}

	function handleCancel() {
		modalStore.close();
	}

	function validateCustomName(name: string): boolean {
		return /^[a-zA-Z][a-zA-Z0-9]*$/.test(name);
	}
</script>

<div class="modal-body p-4">
	<div class="alert variant-filled-warning mb-4">
		<div class="alert-message">
			<h3 class="h3">Collection Name Conflict</h3>
			<p>The collection name "{conflictingName}" already exists at:</p>
			<code class="mt-2 block rounded bg-surface-900 p-2">{conflictPath}</code>
		</div>
	</div>

	<div class="mb-4">
		<label for="suggested-name" class="label mb-2">
			<span>Choose a suggested name:</span>
		</label>
		<select id="suggested-name" class="select" bind:value={selectedName} disabled={useCustomName}>
			{#each suggestions as suggestion}
				<option value={suggestion}>{suggestion}</option>
			{/each}
		</select>
	</div>

	<div class="mb-4">
		<label for="use-custom" class="label">
			<span>Or use a custom name:</span>
		</label>
		<div class="input-group">
			<input id="use-custom" type="checkbox" bind:checked={useCustomName} class="checkbox" />
			<input
				id="custom-name"
				type="text"
				bind:value={customName}
				disabled={!useCustomName}
				class="input"
				placeholder="Enter custom name"
				aria-labelledby="use-custom"
			/>
		</div>
		{#if useCustomName && customName && !validateCustomName(customName)}
			<p class="mt-1 text-sm text-error-500">Name must start with a letter and contain only letters and numbers</p>
		{/if}
	</div>

	<footer class="modal-footer flex justify-end gap-4">
		<button type="button" class="variant-ghost btn" onclick={handleCancel}> Cancel </button>
		<button
			type="button"
			class="variant-filled-primary btn"
			onclick={handleConfirm}
			disabled={useCustomName ? !validateCustomName(customName) : !selectedName}
		>
			Use Selected Name
		</button>
	</footer>
</div>
