<script lang="ts">
	export let data: PageData;
	import type { PageData } from './$types';
	import '@src/stores/store';

	//superforms
	import { superForm } from 'sveltekit-superforms/client';
	import { addUserTokenSchema } from '@src/utils/formSchemas';

	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';
	import { roles } from '@src/collections/types';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	let response: any;
	//console.log(data);
	const { form, constraints, allErrors, errors, enhance } = superForm(data, {
		// const { form, constraints, allErrors, errors, enhance } = superForm(data.addUserForm, {
		id: 'addUser',
		validators: addUserTokenSchema,
		defaultValidator: 'clear',
		applyAction: true,
		taintedMessage: '',
		dataType: 'json',

		onSubmit: ({ cancel }) => {
			if ($allErrors.length > 0) cancel();
		},
		onResult: ({ result, cancel }) => {
			cancel();
			if (result.type == 'success') {
				response = result.data?.message;
			}
		}
	});

	$form.role = 'User';

	// define default role
	let roleSelected = Object.values(roles)[1];

	/// Calculate expiration time in seconds based on expiresIn value
	let expiresIn = '2 hrs'; // Set the default validity
	let expirationTime;

	// Define the validity options and their corresponding seconds
	const validityOptions = [
		{ label: '2 hrs', value: '2 hrs', seconds: 2 * 60 * 60 },
		{ label: '12 hrs', value: '12 hrs', seconds: 12 * 60 * 60 },
		{ label: '2 days', value: '2 days', seconds: 2 * 24 * 60 * 60 },
		{ label: '1 week', value: '1 week', seconds: 7 * 24 * 60 * 60 }
	];
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<header class={`text-center dark:text-primary-500 ${cHeader}`}>
		{$modalStore[0]?.title ?? '(title missing)'}
	</header>
	<article class="text-center text-sm">
		{$modalStore[0]?.body ?? '(body missing)'}
	</article>

	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}" method="post" action="?/addUser" use:enhance>
		<!-- Email field -->
		<div class="group relative z-0 mb-6 w-full">
			<FloatingInput
				label={$LL.LOGIN_EmailAddress()}
				icon="mdi:email"
				type="email"
				bind:value={$form.email}
				required
			/>

			{#if $errors.email}
				<div class="absolute left-0 top-11 text-xs text-error-500">
					{$errors.email}
				</div>
			{/if}
		</div>

		<!-- User Role  -->
		<div class="flex flex-col gap-2 sm:flex-row">
			<div class="sm:w-1/4">User Role:</div>
			<div class="flex-auto">
				<div class="flex flex-wrap gap-2 space-x-2">
					{#each Object.values(roles) as r}
						<span
							class="chip {roleSelected === r
								? 'variant-filled-tertiary'
								: 'variant-ghost-secondary'}"
							on:click={() => {
								// filterRole(r);
								roleSelected = r;
							}}
							on:keypress
							role="button"
							tabindex="0"
						>
							{#if roleSelected === r}
								<span><iconify-icon icon="fa:check" /></span>
							{/if}
							<span class="capitalize">{r}</span>
						</span>
					{/each}
				</div>
			</div>
		</div>

		<!-- Token validity  -->
		<div class="flex flex-col gap-2 pb-6 sm:flex-row">
			<div class="sm:w-1/4">Token validity:</div>
			<div class="flex-auto">
				<div class="flex flex-wrap gap-2 space-x-2">
					{#each validityOptions as option}
						<span
							class="chip {expiresIn === option.value
								? 'variant-filled-tertiary'
								: 'variant-ghost-secondary'}"
							on:click={() => {
								expiresIn = option.value;
								expirationTime = option.seconds;
							}}
							on:keypress
							role="button"
							tabindex="0"
						>
							{#if expiresIn === option.value}<span><iconify-icon icon="fa:check" /></span>{/if}
							<span class="capitalize">{option.label}</span>
						</span>
					{/each}
				</div>
				{#if $errors.expiresIn}
					<div class="mt-1 text-xs text-error-500">
						{$errors.expiresIn}
					</div>
				{/if}
			</div>
		</div>

		<footer class="modal-footer {parent.regionFooter}">
			<button class="btn {parent.buttonNeutral}" on:click={parent.onClose}
				>{parent.buttonTextCancel}</button
			>
			<button type="submit" class="btn {parent.buttonPositive}">Send</button>
		</footer>
	</form>
</div>
