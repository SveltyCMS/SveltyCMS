<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores
	import { modalStore } from '@skeletonlabs/skeleton';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'space-y-4';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	let email = '';

	//TODO: Get Roles from allowed user
	let roles: Record<string, boolean> = {
		Admin: true,
		Editor: false,
		User: false,
		Guest: false,
		other: false
	};

	function filter(role: string): void {
		for (const r in roles) {
			if (r !== role) {
				roles[r] = false;
			}
		}
		roles[role] = !roles[role];
	}
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}">
		<label class="input-label">
			<span>Email:</span>
			<input type="email" bind:value={email} placeholder="Enter email address" class="input" />
		</label>

		<div class="flex flex-col sm:flex-row gap-2">
			<div class="sm:w-1/4">Role:</div>
			<div class="flex-auto">
				<!-- TODO:  bind:value={formData.role}  -->

				<div class="flex flex-wrap gap-2 space-x-2">
					{#each Object.keys(roles) as r}
						<span
							class="chip {roles[r] ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
							on:click={() => {
								filter(r);
							}}
							on:keypress
						>
							{#if roles[r]}<span><Icon icon="fa:check" /></span>{/if}
							<span class="capitalize">{r}</span>
						</span>
					{/each}
				</div>
			</div>
		</div>
	</form>
	<!-- prettier-ignore -->
	<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Send</button>
    </footer>
</div>
