<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	export let existingCategory: any = { name: '', icon: '' }; 

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import IconifyPicker from '@src/components/IconifyPicker.svelte';

	// Form Data
	let formData = {
		newCategoryName: existingCategory.name,
		newCategoryIcon: existingCategory.icon
	};

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	// TODO: add check to delete 
	function deleteCategory(): void {
		if (existingCategory.collections && existingCategory.collections.length > 0) {
			alert('Cannot delete category with associated collections.');
			return;
		}
		
		
	}
</script>

<!-- @component This example creates a simple form modal. -->

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={cHeader}>{$modalStore[0].title ?? '(title missing)'}</header>
		<article>{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->
		<form class="modal-form {cForm}">
			<label class="label">
				<span>Category Name</span>
				<input
					class="input"
					type="text"
					bind:value={formData.newCategoryName}
					placeholder="Enter Category name..."
				/>
			</label>

			<IconifyPicker bind:iconselected={formData.newCategoryIcon} />
		</form>
		
		<footer class="modal-footer flex {existingCategory.name && existingCategory.icon ? 'justify-between' : 'justify-end'} {parent.regionFooter}">
			{#if existingCategory.name && existingCategory.icon} <!-- Check if existing category is being edited -->
				<button type="button" on:click={deleteCategory} class="variant-filled-error btn">
					<iconify-icon icon="icomoon-free:bin" width="24" />Delete
				</button>
			{/if}
			<div class="flex gap-2"> <!-- Removed ml-auto -->
				<button class="btn variant-outline-secondary" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
				<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Submit Form</button>
			</div>
		</footer>
		
		
	</div>
{/if}
