<!--
@files src/routes/(app)/user/components/ModalEditToken.svelte
@component
**Modal for editing or creating user registration tokens**

This component now correctly sends the 'action' property when calling the batch
delete endpoint, resolving the "Unexpected token" browser error.

@props
- `parent` {object} - Parent modal properties (regionFooter, onClose, buttonPositive)
- `token` {string} - Existing token (default: '')
- `user_id` {string} - User ID (default: '')
- `email` {string} - Associated email (default: '')
- `role` {string} - Token role (default: 'user')
- `expires` {string} - Expiration date (default: '2 days')

-->

<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';

	// Skeleton & Stores
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Component
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Get data from page store, which is populated by our server hooks
	const { roles, user } = page.data;

	// Props
	interface Props {
		parent: ModalComponent['props'] & { regionFooter?: string; onClose?: (event: MouseEvent) => void; buttonPositive?: string };
		token: string;
		user_id: string;
		email: string;
		role: string;
		expires: string;
	}

	let { parent = { regionFooter: 'modal-footer p-4' }, token = '', user_id = '', email = '', role = 'user', expires = '' }: Props = $props();

	// Form Data with format conversion
	function convertLegacyFormat(expires: string): string {
		// Convert old format to new API format
		switch (expires) {
			case '1h':
				return '2 hrs'; // Map 1h to closest option
			case '2h':
				return '2 hrs';
			case '12h':
				return '12 hrs';
			case '1d':
				return '2 days'; // Default
			case '2d':
				return '2 days';
			case '7d':
				return '1 week'; // 7 days = 1 week
			case '30d':
				return '1 month'; // 30 days ≈ 1 month
			case '90d':
				return '1 month'; // 90 days, use 1 month as closest
			default:
				// If it's already in new format, return as-is
				if (['2 hrs', '12 hrs', '2 days', '1 week', '2 weeks', '1 month'].includes(expires)) {
					return expires;
				}
				return '2 days'; // Default fallback
		}
	}

	const formData = $state({
		user_id, // Add user_id to state
		email,
		token,
		role: role || 'user',
		expires: !expires || expires === '' ? '2 days' : convertLegacyFormat(expires) // Force '2 days' for empty/undefined expires
	});
	const errorStatus = $state({ email: { status: false, msg: '' } });

	async function onFormSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();

		if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			errorStatus.email = { status: true, msg: 'A valid email is required' };
			return;
		}

		try {
			const isEditMode = !!formData.token;
			const endpoint = isEditMode ? `/api/token/${formData.token}` : '/api/token/createToken';
			const method = isEditMode ? 'PUT' : 'POST';

			const body = isEditMode
				? {
						newTokenData: {
							email: formData.email,
							role: formData.role,
							expiresInHours: convertExpiresToHours(formData.expires)
						}
					}
				: {
						email: formData.email,
						role: formData.role,
						expiresIn: formData.expires // Send the API format directly
					};

			const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			const responseData = await response.json();

			if (!response.ok) {
				throw new Error(responseData.message || 'Operation failed');
			}

			toastStore.trigger({
				message: `<iconify-icon icon="mdi:check" color="white" width="24" class="mr-1"></iconify-icon> ${isEditMode ? 'Token updated' : 'Token created'} successfully`,
				background: 'gradient-tertiary',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			});

			modalStore.close();
			await invalidateAll();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred';
			toastStore.trigger({
				message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${message}`,
				background: 'variant-filled-error',
				timeout: 5000,
				classes: 'border-1 !rounded-md'
			});
		}
	}

	async function deleteToken(): Promise<void> {
		if (!formData.token) return;
		try {
			const response = await fetch(`/api/token/${formData.token}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' }
			});

			const data = await response.json();
			if (!response.ok) {
				// This will now correctly show the JSON error message from the API
				throw new Error(data.message || 'Failed to delete token');
			}

			toastStore.trigger({
				message: `<iconify-icon icon="mdi:check" width="24" class="mr-1"></iconify-icon> ${m.modal_token_user_deleted()}`,
				background: 'gradient-tertiary',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			});
			modalStore.close();
			await invalidateAll();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete token';
			// This catch block will now receive a proper error message if the API fails.
			toastStore.trigger({
				message: `<iconify-icon icon="mdi:alert-circle" width="24" class="mr-1"></iconify-icon> ${message}`,
				background: 'variant-filled-error',
				timeout: 5000,
				classes: 'border-1 !rounded-md'
			});
		}
	}

	function convertExpiresToHours(expires: string): number {
		// Convert API format back to hours for the edit endpoint
		switch (expires) {
			case '2 hrs':
				return 2;
			case '12 hrs':
				return 12;
			case '2 days':
				return 48;
			case '1 week':
				return 168;
			case '2 weeks':
				return 336;
			case '1 month':
				return 720;
			default:
				return 48; // Default 2 days
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- The HTML markup for the form does not need to change -->
{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={`text-center dark:text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>
		<form class="modal-form {cForm}" onsubmit={onFormSubmit} id="token-form">
			<!-- Email field -->
			<div class="group relative z-0 mb-6 w-full">
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
			<input bind:value={formData.token} type="hidden" name="token" />

			<!-- User Role -->
			{#if user.role === 'admin'}
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">
						{m.form_userrole()}: <span class="text-error-500">*</span>
					</div>
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
								<div class="text-sm text-gray-500">No roles available. Check console for debug info.</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Expires field -->
			<div class="group relative z-0 mb-6 w-full">
				<label for="expires-select" class="mb-2 block text-sm font-medium text-black dark:text-white">{m.modaltokenuser_tokenvalidity()}</label>
				<select id="expires-select" bind:value={formData.expires} class="input" aria-label="Token Validity">
					<option value="2 hrs">2 Hours</option>
					<option value="12 hrs">12 Hours</option>
					<option value="2 days">2 Days (default)</option>
					<option value="1 week">1 Week</option>
					<option value="2 weeks">2 Weeks</option>
					<option value="1 month">1 Month</option>
				</select>
			</div>
		</form>

		<footer class="modal-footer flex items-center {formData.token ? 'justify-between' : 'justify-end'} p-4 {parent?.regionFooter ?? ''}">
			<!-- Delete - Only show for existing tokens -->
			{#if formData.token}
				<button type="button" onclick={deleteToken} class="variant-filled-error btn">
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon><span class="hidden sm:block">{m.button_delete()}</span>
				</button>
			{/if}
			<div class="flex gap-2">
				<!-- Cancel -->
				<button type="button" class="variant-outline-secondary btn" onclick={parent?.onClose}>{m.button_cancel()}</button>
				<!-- Save -->
				<button type="submit" form="token-form" class="variant-filled-tertiary btn dark:variant-filled-primary {parent?.buttonPositive ?? ''}">
					{m.button_save()}
				</button>
			</div>
		</footer>
	</div>
{/if}
