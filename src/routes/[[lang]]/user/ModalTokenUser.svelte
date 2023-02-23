<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores
	import { modalStore } from '@skeletonlabs/skeleton';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import { enhance } from '$app/forms';

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

	let errorStatus = {
		email: { status: false, msg: '' }
	};
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}">
		<!-- Email field -->
		<div class="group relative z-0 mb-6 w-full">
			<Icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-400" />
			<input
				bind:value={email}
				on:keydown={() => (errorStatus.email.status = false)}
				color={errorStatus.email.status ? 'red' : 'base'}
				type="email"
				name="email"
				class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
				placeholder=" "
				required
			/>
			<label
				for="email"
				class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
			>
				{$LL.LOGIN_EmailAddress()}<span class="ml-2 text-error-500">*</span>
			</label>
			{#if errorStatus.email.status}
				<div class="absolute top-11 left-0 text-xs text-error-500">
					{errorStatus.email.msg}
				</div>
			{/if}
		</div>

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
