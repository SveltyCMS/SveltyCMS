<!--
@files src/routes/(app)/user/components/ModalEditToken.svelte
@component
**Modal for editing or creating user registration tokens**

This component provides a form to create new registration tokens or edit existing ones.
It handles token creation, updates, and deletion with proper validation and error handling.

@props
- `parent` {object} - Parent modal properties (regionFooter, onClose, buttonPositive)
- `token` {string} - Existing token (default: '')
- `user_id` {string} - User ID (default: '')
- `email` {string} - Associated email (default: '')
- `role` {string} - Token role (default: 'user')
- `expires` {string} - Expiration date (default: '2 days')

-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	// Skeleton & Stores
	// // getModalStore deprecated - use modalState from @utils/modalState.svelte;
	// const modalStore = getModalStore();

	import { toaster } from '@stores/store.svelte';

	// Component
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { Form } from '@utils/Form.svelte';
	import { addUserTokenSchema } from '@utils/formSchemas';

	// Get data from page store, which is populated by our server hooks
	const { roles, user } = page.data;

	// Props
	interface Props {
		token: string;
		user_id: string;
		email: string;
		role: string;
		expires: string;
		close?: () => void;
	}

	const { token = '', user_id = '', email = '', role = 'user', expires = '', close }: Props = $props();

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

	const tokenForm = new Form(
		{
			user_id: '',
			email: '',
			token: '',
			role: 'user',
			expiresIn: '2 days'
		},
		addUserTokenSchema
	);

	$effect(() => {
		tokenForm.data.user_id = user_id;
		tokenForm.data.email = email;
		tokenForm.data.token = token;
		tokenForm.data.role = role || 'user';
		tokenForm.data.expiresIn = !expires || expires === '' ? '2 days' : convertLegacyFormat(expires);
	});

	async function onFormSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();

		if (!tokenForm.validate()) {
			return;
		}

		tokenForm.submitting = true;

		try {
			const isEditMode = !!tokenForm.data.token;
			const endpoint = isEditMode ? `/api/token/${tokenForm.data.token}` : '/api/token/createToken';
			const method = isEditMode ? 'PUT' : 'POST';

			const body = isEditMode
				? {
						newTokenData: {
							email: tokenForm.data.email,
							role: tokenForm.data.role,
							expiresInHours: convertExpiresToHours(tokenForm.data.expiresIn)
						}
					}
				: {
						email: tokenForm.data.email,
						role: tokenForm.data.role,
						expiresIn: tokenForm.data.expiresIn // Send the API format directly
					};

			const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			const responseData = await response.json();

			if (!response.ok) {
				throw new Error(responseData.message || 'Operation failed');
			}

			// Check if SMTP is not configured
			if (responseData.smtp_not_configured) {
				toaster.warning({
					description: `<iconify-icon icon="mdi:email-alert" color="white" width="24" class="mr-1"></iconify-icon> ${isEditMode ? 'Token updated' : 'Token created'} - Email not sent: SMTP not configured`
				});
			} else if (responseData.dev_mode && !responseData.email_sent) {
				// Email was skipped due to dev mode or dummy config
				toaster.info({
					description: `<iconify-icon icon="mdi:dev-to" color="white" width="24" class="mr-1"></iconify-icon> ${isEditMode ? 'Token updated' : 'Token created'} - Email sending skipped (dev mode)`
				});
			} else {
				// Success - email sent
				// TODO: Add 'user_token_created' to messages or find correct key
				toaster.success({ description: 'User token created' });
			}

			// Invalidate data first, then close modal
			await invalidateAll();

			// Close modal and trigger response handler
			if (close) close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred';
			toaster.error({ description: message });
		} finally {
			tokenForm.submitting = false;
		}
	}

	async function deleteToken(): Promise<void> {
		if (!tokenForm.data.token) return;
		try {
			const response = await fetch(`/api/token/${tokenForm.data.token}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' }
			});

			const data = await response.json();
			if (!response.ok) {
				// This will now correctly show the JSON error message from the API
				throw new Error(data.message || 'Failed to delete token');
			}

			toaster.success({
				description: `<iconify-icon icon="mdi:check" width="24" class="mr-1"></iconify-icon> ${m.modal_token_deleted_successfully()}`
			});
			// Invalidate data first, then close modal
			await invalidateAll();

			// Close modal and trigger response handler
			if (close) close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete token';
			// This catch block will now receive a proper error message if the API fails.
			toaster.error({ description: `<iconify-icon icon="mdi:alert-circle" width="24" class="mr-1"></iconify-icon> ${message}` });
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
</script>

<div class="modal-example-form space-y-4 text-black dark:text-white">
	<!-- Header title handled by DialogManager if passed as prop, but keeping internal header if needed for specific layout -->

	<form class="modal-form space-y-4" onsubmit={onFormSubmit} id="token-form">
		<!-- Email field -->
		<div class="group relative z-0 mb-6 w-full">
			<FloatingInput
				type="text"
				name="email"
				label={m.email()}
				bind:value={tokenForm.data.email}
				onkeydown={() => (tokenForm.errors.email = [])}
				required
				autocomplete="email"
				icon="mdi:email"
				textColor="text-tertiary-500 dark:text-white"
			/>
			{#if tokenForm.errors.email}
				<div class="absolute left-0 top-11 text-xs text-error-500">
					{tokenForm.errors.email[0]}
				</div>
			{/if}
		</div>
		<!-- Token field (hidden but still submitted with form) -->
		<input bind:value={tokenForm.data.token} type="hidden" name="token" />

		<!-- User Role -->
		{#if user.role === 'admin'}
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">
					{m.role()}: <span class="text-error-500">*</span>
				</div>
				<div class="flex-auto">
					<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
						{#if roles && roles.length > 0}
							{#each roles as r}
								<button
									type="button"
									class="chip {tokenForm.data.role === r._id ? 'preset-filled-tertiary-500' : 'preset-ghost-secondary-500'}"
									onclick={() => (tokenForm.data.role = r._id)}
								>
									{#if tokenForm.data.role === r._id}
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
			<select
				id="expires-select"
				bind:value={tokenForm.data.expiresIn}
				class="input bg-white text-black dark:bg-surface-700 dark:text-white"
				aria-label="Token Validity"
			>
				<option value="2 hrs">2 Hours</option>
				<option value="12 hrs">12 Hours</option>
				<option value="2 days">2 Days (default)</option>
				<option value="1 week">1 Week</option>
				<option value="2 weeks">2 Weeks</option>
				<option value="1 month">1 Month</option>
			</select>
		</div>

		<footer class="modal-footer flex items-center {tokenForm.data.token ? 'justify-between' : 'justify-end'} pt-4 border-t border-surface-500/20">
			<!-- Delete - Only show for existing tokens -->
			{#if tokenForm.data.token}
				<button type="button" onclick={deleteToken} class="preset-filled-error-500 btn">
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon><span class="hidden sm:block">{m.button_delete()}</span>
				</button>
			{/if}
			<div class="flex gap-2">
				<!-- Cancel -->
				<button type="button" class="preset-outlined-secondary-500 btn" onclick={() => close?.()}>{m.button_cancel()}</button>
				<!-- Save -->
				<button type="submit" form="token-form" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">
					{m.button_save()}
				</button>
			</div>
		</footer>
	</form>
</div>
