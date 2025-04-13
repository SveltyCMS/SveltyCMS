<!--
@files src/components/user/ModalEditToken.svelte
@component
**Modal for editing or creating user registration tokens**

Manages token creation and updates with role selection and expiration settings. Optimized for performance, consistency, and accessibility.

@props
- `token` {string} - Existing token (default: '')
- `email` {string} - Associated email (default: '')
- `role` {string} - Token role (default: '')
- `expires` {string} - Expiration date (default: '')
- `user_id` {string} - User ID (default: '')
-->

<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';

	// Skeleton
	import { Modal } from '@skeletonlabs/skeleton-svelte';
	import { Toaster, createToaster } from '@skeletonlabs/skeleton-svelte';
	const toaster = createToaster();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	const {
		token = '',
		email = '',
		role = '',
		expires = '',
		user_id = ''
	} = $props<{
		token?: string;
		email?: string;
		role?: string;
		expires?: string;
		user_id?: string;
	}>();

	// Get data from page store
	const { roles, user } = page.data;

	// Modal state
	let openState = $state(false);

	// Form data
	const formData = $state({
		user_id: user_id,
		email: email,
		token: token,
		role: role,
		expires: expires
	});

	const errorStatus = $state({
		user_id: { status: false, msg: '' },
		email: { status: false, msg: '' },
		token: { status: false, msg: '' }
	});

	// Submit function
	async function onFormSubmit(): Promise<void> {
		try {
			const response = await fetch('/api/user/editToken', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tokenId: formData.token,
					newTokenData: { role: formData.role, expires: formData.expires }
				})
			});

			if (response.ok) {
				toaster.success({
					title: 'Success',
					description: '<iconify-icon icon="mdi:check" color="white" width="24" class="mr-1"></iconify-icon> Token updated successfully',
					type: 'success',
					duration: 3000
				});
				openState = false;
				await invalidateAll();
			} else {
				const data = await response.json();
				throw new Error(data.message || 'Failed to update token');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update token';
			toaster.error({
				title: 'Error',
				description: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${message}`,
				type: 'error',
				duration: 3000
			});
		}
	}

	// Delete function
	async function deleteToken(): Promise<void> {
		try {
			const response = await fetch('/api/user/deleteToken', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify([{ token: formData.token }])
			});

			if (response.ok) {
				toaster.success({
					title: 'Success',
					description: '<iconify-icon icon="mdi:check" color="white" width="24" class="mr-1"></iconify-icon> Token deleted successfully',
					type: 'success',
					duration: 3000
				});
				openState = false;
				await invalidateAll();
			} else {
				const data = await response.json();
				throw new Error(data.message || 'Failed to delete token');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete token';
			toaster.error({
				title: 'Error',
				description: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${message}`,
				type: 'error',
				duration: 3000
			});
		}
	}
</script>

<!-- Toaster Component -->
<Toaster {toaster} />

<Modal
	open={openState}
	onOpenChange={(e) => (openState = e.open)}
	triggerBase="btn preset-tonal"
	contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
	backdropClasses="backdrop-blur-sm"
>
	{#snippet trigger()}
		<button>Edit Token</button>
	{/snippet}

	{#snippet content()}
		<header class="text-primary-500 text-center text-2xl font-bold">
			Edit Token for {email}
		</header>
		<article class="text-center text-sm">Update the role and expiration for this token.</article>
		<form class="border-surface-500 rounded-container space-y-4 border p-4">
			<!-- Username field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:user-circle" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
				<input
					bind:value={formData.user_id}
					onkeydown={() => (errorStatus.user_id.status = false)}
					type="text"
					name="username"
					class="peer border-surface-300! text-surface-900 focus:border-tertiary-600 dark:border-surface-600 dark:focus:border-tertiary-500 block w-full appearance-none rounded-none! border-0! border-b-2! bg-transparent! px-6 py-2.5 text-sm focus:ring-0 focus:outline-hidden dark:text-white"
					placeholder=" "
					required
					disabled
				/>
				<label
					for="username"
					class="peer-focus:text-tertiary-600 dark:text-surface-400 dark:peer-focus:text-tertiary-500 absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75"
				>
					{m.modaledit_tokenusername()}<span class="text-error-500 ml-2">*</span>
				</label>
				{#if errorStatus.user_id.status}
					<div class="text-error-500 absolute top-11 left-0 text-xs">
						{errorStatus.user_id.msg}
					</div>
				{/if}
			</div>

			<!-- Email field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
				<input
					bind:value={formData.email}
					onkeydown={() => (errorStatus.email.status = false)}
					type="email"
					name="email"
					class="peer border-surface-300! text-surface-900 focus:border-tertiary-600 dark:border-surface-600 dark:focus:border-tertiary-500 block w-full appearance-none rounded-none! border-0! border-b-2! bg-transparent! px-6 py-2.5 text-sm focus:ring-0 focus:outline-hidden dark:text-white"
					placeholder=" "
					required
					disabled
				/>
				<label
					for="email"
					class="peer-focus:text-tertiary-600 dark:text-surface-400 dark:peer-focus:text-tertiary-500 absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75"
				>
					{m.form_emailaddress()}<span class="text-error-500 ml-2">*</span>
				</label>
				{#if errorStatus.email.status}
					<div class="text-error-500 absolute top-11 left-0 text-xs">
						{errorStatus.email.msg}
					</div>
				{/if}
			</div>

			<!-- Token field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:token" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
				<input
					bind:value={formData.token}
					onkeydown={() => (errorStatus.token.status = false)}
					type="text"
					name="token"
					class="peer border-surface-300! text-surface-900 focus:border-tertiary-600 dark:border-surface-600 dark:focus:border-tertiary-500 block w-full appearance-none rounded-none! border-0! border-b-2! bg-transparent! px-6 py-2.5 text-sm focus:ring-0 focus:outline-hidden dark:text-white"
					placeholder=" "
					required
					disabled
				/>
				<label
					for="token"
					class="peer-focus:text-tertiary-600 dark:text-surface-400 dark:peer-focus:text-tertiary-500 absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75"
				>
					{m.modaledit_tokenregistrationtoken()}<span class="text-error-500 ml-2">*</span>
				</label>
				{#if errorStatus.token.status}
					<div class="text-error-500 absolute top-11 left-0 text-xs">
						{errorStatus.token.msg}
					</div>
				{/if}
			</div>

			<!-- Admin area -->
			{#if user.role === 'admin'}
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.form_userrole()}:</div>
					<div class="flex-auto">
						<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
							{#if roles && roles.length > 0}
								{#each roles as r}
									<button
										type="button"
										class="chip {formData.role === r._id ? 'preset-filled-tertiary-500' : 'preset-tonal-secondary border-secondary-500 border'}"
										onclick={() => (formData.role = r._id)}
									>
										{#if formData.role === r._id}
											<span><iconify-icon icon="fa:check"></iconify-icon></span>
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
			{/if}
		</form>

		<footer class="flex items-center justify-between p-4">
			<!-- Delete -->
			<button
				type="button"
				onclick={async () => {
					await deleteToken();
					openState = false;
				}}
				class="preset-filled-error-500 btn"
			>
				<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon><span class="hidden sm:block">{m.button_delete()}</span>
			</button>
			<div class="flex justify-between gap-2">
				<!-- Cancel -->
				<button class="preset-outline-secondary btn" onclick={() => (openState = false)}>
					{m.button_cancel()}
				</button>
				<!-- Save -->
				<button
					class="preset-filled-tertiary-500 btn"
					onclick={async () => {
						await onFormSubmit();
						openState = false;
					}}
				>
					{m.button_save()}
				</button>
			</div>
		</footer>
	{/snippet}
</Modal>
