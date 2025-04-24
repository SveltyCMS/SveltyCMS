<!-- 
@files src/routes/(app)/user/components/ModalEditToken.svelte
@component
**Modal for editing or creating user registration tokens**

Manages token creation and updates with role selection and expiration settings. Optimized for performance, consistency, and accessibility.

@props
- `parent` {object} - Parent modal properties (regionFooter, onClose, buttonPositive)
- `token` {string} - Existing token (default: '')
- `email` {string} - Associated email (default: '')
- `role` {string} - Token role (default: '')
- `expires` {string} - Expiration date (default: '')
- `user_id` {string} - User ID (default: '')
-->

<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';

	// Get data from page store
	const { roles, user } = page.data;

	// Skeleton & Stores
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Component
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		// Props
		parent: ModalComponent['props'] & {
			regionFooter?: string;
			onClose?: (event: MouseEvent) => void;
			buttonPositive?: string;
		};
		token: string;
		email: string;
		role: string;
		expires: string;
		user_id: string;
	}

	let { parent = { regionFooter: 'modal-footer p-4' }, token = '', email = '', role = '', expires = '', user_id = '' }: Props = $props();

	let formElement: HTMLFormElement | null = $state(null);

	// Form Data
	const formData = $state({
		user_id: user_id || '',
		email: email || '',
		token: token || '',
		role: role || '',
		expires: expires || ''
	});

	const errorStatus = $state({
		user_id: { status: false, msg: '' },
		email: { status: false, msg: '' },
		token: { status: false, msg: '' }
	});

	// Custom submit function to pass the response and close the modal
	async function onFormSubmit(): Promise<void> {
		try {
			const response = await fetch('/api/user/editToken', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					tokenId: formData.token,
					newTokenData: {
						role: formData.role,
						expires: formData.expires
					}
				})
			});

			if (response.ok) {
				const t = {
					message: '<iconify-icon icon="mdi:check" color="white" width="24" class="mr-1"></iconify-icon> Token updated successfully',
					background: 'gradient-tertiary',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				modalStore.close();
				await invalidateAll();
			} else {
				const data = await response.json();
				throw new Error(data.message || 'Failed to update token');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update token';
			const t = {
				message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${message}`,
				background: 'variant-filled-error',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
		}
	}

	async function deleteToken(): Promise<void> {
		try {
			const response = await fetch('/api/user/deleteToken', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify([{ token: formData.token }])
			});

			if (response.ok) {
				const t = {
					message: '<iconify-icon icon="mdi:check" color="white" width="24" class="mr-1"></iconify-icon> Token deleted successfully',
					background: 'gradient-tertiary',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				modalStore.close();
				await invalidateAll();
			} else {
				const data = await response.json();
				throw new Error(data.message || 'Failed to delete token');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete token';
			const t = {
				message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${message}`,
				background: 'variant-filled-error',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

d<!-- @component This example creates a simple form modal. -->
{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={`text-center dark:text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>
		<form class="modal-form {cForm}" bind:this={formElement} id="change_user_form">
			<!-- Username field -->
			<div class="group relative z-0 mb-6 w-full">
				<FloatingInput
					type="text"
					name="username"
					label={m.modaledit_tokenusername()}
					bind:value={formData.user_id}
					onkeydown={() => (errorStatus.user_id.status = false)}
					required
					icon="mdi:user-circle"
				/>
				{#if errorStatus.user_id.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.user_id.msg}
					</div>
				{/if}
			</div>

			<!-- Email field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
				<FloatingInput
					type="email"
					name="email"
					label={m.form_emailaddress()}
					bind:value={formData.email}
					onkeydown={() => (errorStatus.email.status = false)}
					required
					autocomplete="email"
					icon="mdi:email"
				/>
				{#if errorStatus.email.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.email.msg}
					</div>
				{/if}
			</div>
			<!-- Token field (hidden but still submitted with form) -->
			<input bind:value={formData.token} type="hidden" name="token" required />

			<!-- Admin area -->
			{#if user.role == 'admin'}
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.form_userrole()}:</div>
					<div class="flex-auto">
						<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
							{#if roles && roles.length > 0}
								{#each roles as r}
									<button
										type="button"
										class="chip {formData.role === r._id ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
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

		<footer class="modal-footer flex items-center justify-between p-4 {parent?.regionFooter ?? ''}">
			<!-- Delete -->
			<button type="button" onclick={deleteToken} class="variant-filled-error btn">
				<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon><span class="hidden sm:block">{m.button_delete()}</span>
			</button>

			<div class="flex justify-between gap-2">
				<!-- Cancel -->
				<button class="variant-outline-secondary btn" onclick={parent?.onClose}>{m.button_cancel()}</button>
				<!-- Save -->
				<button class="variant-filled-tertiary btn dark:variant-filled-primary{parent?.buttonPositive ?? ''}" onclick={onFormSubmit}
					>{m.button_save()}</button
				>
			</div>
		</footer>
	</div>
{/if}
