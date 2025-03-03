<script lang="ts">
	import { Modal } from '@skeletonlabs/skeleton-svelte';

	// Props
	interface Props {
		isEditMode: boolean;
		roleName: string;
	}

	let { isEditMode, roleName }: Props = $props();

	// Local form state
	let formName = $state(roleName);

	let openState = $state(false);

	function onFormSubmit(event: SubmitEvent): void {
		event.preventDefault();
		openState = false;
	}
</script>

<Modal
	open={openState}
	onOpenChange={(e) => (openState = e.open)}
	triggerBase="btn preset-tonal"
	contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
	backdropClasses="backdrop-blur-sm"
>
	{#snippet trigger()}
		<button type="button" class="btn preset-tonal" onclick={() => (openState = true)}>
			{isEditMode ? 'Edit Role' : 'Create New Role'}
		</button>
	{/snippet}

	{#snippet content()}
		<header class="flex justify-between">
			<h2 class="h2">{isEditMode ? 'Edit Role' : 'Create New Role'}</h2>
		</header>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				onFormSubmit(e);
			}}
			class="space-y-4"
		>
			<label>
				<span class="mb-2 block">Role Name:</span>
				<input type="text" bind:value={formName} placeholder="Role Name" class="input w-full" required />
			</label>

			<label>
				<span class="mb-2 block">Role Description:</span>
				<textarea placeholder="Role Description" class="input w-full" rows="3"></textarea>
			</label>
		</form>
	{/snippet}
</Modal>
