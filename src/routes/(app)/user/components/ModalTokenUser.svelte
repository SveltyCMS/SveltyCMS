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
	const initialForm = {
		email: '',
		role: roles[1]?._id || '',
		expiresIn: 2,
		expiresInLabel: '2 hrs'
	};

	// Superforms
	import { superForm } from 'sveltekit-superforms/client';
	import { valibot } from 'sveltekit-superforms/adapters';
	import { addUserTokenSchema } from '@utils/formSchemas';

	const { form, errors } = superForm(initialForm, {
		id: 'addUser',
		validators: valibot(addUserTokenSchema),
		taintedMessage: null,
		dataType: 'json',
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
			} else {
				const t = {
					message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${
						result.error?.message || 'Failed to send invite'
					}`,
					background: 'variant-filled-error',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			}
		}
	});

	// Define the validity options
	const validityOptions = [
		{ label: '2 hrs', value: 2 },
		{ label: '12 hrs', value: 12 },
		{ label: '2 days', value: 48 },
		{ label: '1 week', value: 168 }
	];

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	async function handleSubmit(event: Event) {
		event.preventDefault();

		try {
			const response = await fetch('/api/user/createToken', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: $form.email,
					role: $form.role,
					expiresIn: $form.expiresIn,
					expiresInLabel: $form.expiresInLabel
				})
			});

			const result = await response.json();

			if (response.ok) {
				const t = {
					message: '<iconify-icon icon="mdi:email-fast-outline" color="white" width="24" class="mr-1"></iconify-icon> Email Invite Sent',
					background: 'gradient-tertiary',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				modalStore.close();
				await invalidateAll();
			} else {
				const t = {
					message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${result.message || 'Failed to send invite'}`,
					background: 'variant-filled-error',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			}
		} catch (error) {
			console.error('Error submitting form:', error);
			const t = {
				message: '<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> Failed to send invite',
				background: 'variant-filled-error',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
		}
	}
</script>

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={`text-center dark:text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>

		<form class="modal-form {cForm}" on:submit={handleSubmit}>
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
									class="chip {$form.role === r._id ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
									on:click={() => {
										$form.role = r._id;
									}}
									tabindex="0"
									aria-label={`Role: ${r.name}`}
									aria-pressed={$form.role === r._id ? 'true' : 'false'}
								>
									{#if $form.role === r._id}
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
								class="chip {$form.expiresIn === option.value ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
								on:click={() => {
									$form.expiresIn = option.value;
									$form.expiresInLabel = option.label;
								}}
								on:keypress
								role="button"
								tabindex="0"
							>
								{#if $form.expiresIn === option.value}
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
