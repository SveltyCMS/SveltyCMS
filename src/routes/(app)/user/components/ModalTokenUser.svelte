<!-- 
@files: src/components/user/ModalTokenUser.svelte 
@description: Modal component for generating user registration email tokens 

Features:
- API-based token creation
- Email sending integration
- Proper error handling
- Accurate success/failure feedback
-->
<script lang="ts">
	import type { PageData } from '../$types';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import '@stores/store';

	// Get data from page store
	const { roles } = $page.data;

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	export let addUserForm: PageData['addUserForm'];
	export let parent: any;

	// Skeleton & Stores
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Form state initialization
	if (!addUserForm) {
		addUserForm = {
			email: '',
			role: roles[1]?._id || '',
			password: '',
			expiresIn: 2,
			expiresInLabel: '2 hrs'
		} as unknown as PageData['addUserForm'];
	}

	// Superforms
	import { superForm } from 'sveltekit-superforms/client';
	import { valibot } from 'sveltekit-superforms/adapters';
	import { addUserTokenSchema } from '@utils/formSchemas';

	const { form, allErrors, errors, enhance } = superForm(addUserForm as Record<string, unknown>, {
		id: 'addUser',
		validators: valibot(addUserTokenSchema),
		applyAction: true,
		taintedMessage: '',
		dataType: 'json',

		onSubmit: ({ cancel }) => {
			if ($allErrors.length > 0) cancel();
		},

		onResult: async ({ result }) => {
			if (result.type === 'success') {
				const t = {
					message: '<iconify-icon icon="mdi:email-fast-outline" color="white" width="24" class="mr-1"></iconify-icon> Email Invite Sent',
					background: 'gradient-tertiary',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				modalStore.close();
				await invalidateAll();
			} else if (result.type === 'error') {
				const t = {
					message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${
						result.error?.message || 'Failed to send invite'
					}`,
					background: 'variant-filled-error',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			} else if (result.type === 'failure') {
				const t = {
					message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${
						result.data?.message || 'Failed to send invite'
					}`,
					background: 'variant-filled-error',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			}
		}
	});

	// Define default role and token validity options
	let roleSelected: string = roles[1]?._id || ''; // Ensure the correct type
	let expiresIn = 2; // Set the default validity as number
	let expiresInLabel = '2 hrs';

	// Define the validity options with proper number values
	const validityOptions = [
		{ label: '2 hrs', value: 2 },
		{ label: '12 hrs', value: 12 },
		{ label: '2 days', value: 48 },
		{ label: '1 week', value: 168 }
	];

	// Update form values when selections change
	$: {
		$form.role = roleSelected;
		$form.expiresIn = expiresIn;
		$form.expiresInLabel = expiresInLabel;
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={`text-center dark:text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>

		<form class="modal-form {cForm}" method="POST" action="/api/user/createToken" id="addUser" use:enhance>
			<!-- Email field -->
			<div class="group relative mb-6 w-full">
				<FloatingInput
					label={m.form_emailaddress()}
					icon="mdi:email"
					name="email"
					type="email"
					inputClass="border-primary-500"
					bind:value={$form.email}
					required
				/>

				{#if $errors.email}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{$errors.email}
					</div>
				{/if}
			</div>

			<!-- User Role -->
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">
					{m.form_userrole()}
				</div>
				<div class="flex-auto">
					<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
						{#if roles && roles.length > 0}
							{#each roles as r (r._id)}
								<button
									type="button"
									class="chip {roleSelected === r._id ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
									on:click={() => {
										roleSelected = r._id;
									}}
									tabindex="0"
									aria-label={`Role: ${r.name}`}
									aria-pressed={roleSelected === r._id ? 'true' : 'false'}
								>
									{#if roleSelected === r._id}
										<span><iconify-icon icon="fa:check" /></span>
									{/if}
									<span class="capitalize">{r.name}</span>
								</button>
							{/each}
						{:else}
							<p class="text-tertiary-500 dark:text-primary-500">Loading roles...</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Token validity -->
			<div class="flex flex-col gap-1 pb-6 sm:flex-row sm:gap-2">
				<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">
					{m.modaltokenuser_tokenvalidity()}
				</div>
				<div class="flex-auto">
					<div class="flex flex-wrap justify-center gap-1 space-x-2 sm:justify-start sm:gap-2">
						{#each validityOptions as option}
							<span
								class="chip {expiresIn === option.value ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
								on:click={() => {
									expiresIn = option.value;
									expiresInLabel = option.label;
								}}
								on:keypress
								role="button"
								tabindex="0"
							>
								{#if expiresIn === option.value}
									<span><iconify-icon icon="fa:check" /></span>
								{/if}
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

			<!-- Footer buttons -->
			<footer class="flex items-center justify-between {parent.regionFooter}">
				<!-- Cancel -->
				<button on:click={parent.onClose} type="button" aria-label={m.button_cancel()} class="variant-outline-secondary btn">
					{m.button_cancel()}
				</button>
				<!-- Send -->
				<button type="submit" aria-label={m.button_send()} class="variant-filled-tertiary btn dark:variant-filled-primary {parent.buttonPositive}">
					{m.button_send()}
				</button>
			</footer>
		</form>
	</div>
{/if}
