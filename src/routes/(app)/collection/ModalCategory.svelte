<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	export let existingCategory: any = { name: '', icon: '' };

	// Stores
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import IconifyPicker from '@src/components/IconifyPicker.svelte';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

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
	const cHeader = 'text-center text-primary-500 text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	// Assuming $categories is a writable store
	import { categories, unAssigned } from '@src/stores/store';

	function deleteCategory(): void {
		if (existingCategory.collections === undefined || existingCategory.collections.length === 0) {
			console.log('No associated collections. Proceeding with deletion...');

			// Define the confirmation modal
			const confirmModal: ModalSettings = {
				type: 'confirm',
				title: 'Please Confirm',
				body: 'Are you sure you wish to delete this category?',
				response: (r: boolean) => {
					if (r) {
						// User confirmed, proceed with deletion

						// Remove the category from the store
						categories.update((existingCategories) => {
							console.log('Updated Categories:', categories);
							return existingCategories.filter((category) => category.name !== existingCategory.name);
						});

						// Add the collections to the unAssigned store
						unAssigned.update((existingUnassigned) => {
							const collections = Array.isArray(existingCategory.collections) ? existingCategory.collections : [];
							console.log('Collections to be unassigned:', collections);
							return [...existingUnassigned, ...collections];
						});
					} else {
						// User cancelled, do not delete
						console.log('User cancelled deletion.');
					}
				}
			};

			// Trigger the confirmation modal
			modalStore.trigger(confirmModal);
			// Close the modal
			modalStore.close();
		} else {
			alert('Cannot delete category with associated collections.');
		}
	}
</script>

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={cHeader}>{$modalStore[0].title ?? '(title missing)'}</header>
		<article class="hidden text-center sm:block">{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->
		<form class="modal-form {cForm}">
			<label class="label">
				<span>{$LL.MODAL_Category_Name()}</span>
				<input class="input" type="text" bind:value={formData.newCategoryName} placeholder={$LL.MODAL_Category_Placeholder()} />
			</label>

			<label class="label"
				>{$LL.MODAL_Category_Icon()}
				<IconifyPicker bind:iconselected={formData.newCategoryIcon} />
			</label>
		</form>

		<footer class="modal-footer flex {existingCategory.name ? 'justify-between' : 'justify-end'} {parent.regionFooter}">
			{#if existingCategory.name}
				<!-- Check if existing category is being edited -->
				<button type="button" on:click={deleteCategory} class="variant-filled-error btn">
					<iconify-icon icon="icomoon-free:bin" width="24" /><span class="hidden md:inline">{$LL.MODAL_Category_Delete()}</span>
				</button>
			{/if}

			<div class="flex gap-2">
				<button class="variant-outline-secondary btn" on:click={parent.onClose}>{$LL.MODAL_Category_Cancel()}</button>
				<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{$LL.MODAL_Category_Save()}</button>
			</div>
		</footer>
	</div>
{/if}
