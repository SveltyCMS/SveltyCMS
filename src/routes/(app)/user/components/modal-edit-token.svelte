<!--
@files src/routes/(app)/user/components/modal-edit-token.svelte
@component
**Modal for editing or creating user registration tokens**

This component provides a form to create new registration tokens or edit existing ones.
It handles token creation, updates, and deletion with proper validation and error handling.

@props
- `parent` {object} - Parent modal properties (regionFooter, onClose, buttonPositive)
- `token` {string} - Existing token (default: '')
- `user_id` {string} - User ID (default: '')
- `email` {string} - Associated email (default: '')
- `role` {string} - Token role (default: 'admin')
- `expires` {string} - Expiration date (default: '2 days')

-->

<script lang="ts">
	import FloatingInput from '@src/components/system/inputs/floating-input.svelte';
	// ParaglideJS
	import {
		button_cancel,
		button_delete,
		button_save,
		email as m_email,
		modal_token_deleted_successfully,
		modaltokenuser_tokenvalidity,
		role as m_role
	} from '@src/paraglide/messages';

	// Skeleton & Stores
	import { toaster } from '@src/stores/store.svelte.ts';
	import { Form } from '@utils/form.svelte.ts';
	import { addUserTokenSchema } from '@utils/form-schemas';
	// Utils
	import { modalState } from '@utils/modal-state.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	// Props
	interface Props {
		close?: (val?: any) => void;
		email?: string;
		expires?: string;
		role?: string;
		roles?: any[];
		token?: string;
		// Allow passing user/roles as props for flexibility/testing
		user?: any;
		user_id?: string;
	}

	let { token = '', user_id = '', email = '', role = 'admin', expires = '', user = page.data.user, roles = page.data.roles, close }: Props = $props();

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
			role: 'admin',
			expiresIn: '2 days'
		},
		addUserTokenSchema
	);

	$effect(() => {
		tokenForm.data.user_id = user_id;
		tokenForm.data.email = email;
		tokenForm.data.token = token;
		tokenForm.data.role = role || 'admin';
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

			const response = await fetch(endpoint, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const responseData = await response.json();

			if (!response.ok) {
				throw new Error(responseData.message || 'Operation failed');
			}

			// Check if SMTP is not configured
			if (responseData.smtp_not_configured) {
				toaster.warning({
					title: 'Warning',
					description: `${isEditMode ? 'Token updated' : 'Token created'} - Email not sent: SMTP not configured. Token is listed in Admin Area.`
				});
			} else if (responseData.dev_mode && !responseData.email_sent) {
				// Email was skipped due to dev mode or dummy config
				toaster.info({
					title: 'Info',
					description: `${isEditMode ? 'Token updated' : 'Token created'} - Email sending skipped (dev mode)`
				});
			} else {
				// Success - email sent
				// TODO: Add 'user_token_created' to messages or find correct key
				toaster.success({ title: 'Success', description: 'User token created' });
			}

			// Invalidate data first, then close modal
			await invalidateAll();

			// Close modal and trigger response handler
			if (close) {
				close({ success: true });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred';
			toaster.error({ title: 'Error', description: message });
		} finally {
			tokenForm.submitting = false;
		}
	}

	async function deleteToken(): Promise<void> {
		if (!tokenForm.data.token) {
			return;
		}
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
				title: 'Success',
				description: modal_token_deleted_successfully()
			});
			// Invalidate data first, then close modal
			await invalidateAll();

			// Close modal and trigger response handler
			if (close) {
				close({ success: true });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete token';
			// This catch block will now receive a proper error message if the API fails.
			toaster.error({ title: 'Error', description: message });
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
	<form class="modal-form grid grid-cols-1 gap-4" onsubmit={onFormSubmit} id="token-form">
		<!-- Email field -->
		<FloatingInput
			type="text"
			name="email"
			label={m_email()}
			bind:value={tokenForm.data.email}
			onkeydown={() => (tokenForm.errors.email = [])}
			required
			autocomplete="email"
			icon="mdi:email"
			textColor="text-tertiary-500 dark:text-white"
			invalid={!!tokenForm.errors.email?.length}
			errorMessage={tokenForm.errors.email?.[0]}
		/>
		<!-- Token field (hidden but still submitted with form) -->
		<input bind:value={tokenForm.data.token} type="hidden" name="token" />

		<!-- User Role -->
		{#if user.role === 'admin'}
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m_role()}: <span class="text-error-500">*</span></div>
				<div class="flex-auto">
					<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
						{#if roles && roles.length > 0}
							{#each roles as r (r._id)}
								<button
									type="button"
									class="chip {tokenForm.data.role === r._id
										? 'preset-filled-tertiary-500 dark:preset-filled-primary-500'
										: 'bg-surface-200 dark:bg-surface-100 text-black dark:text-white'}"
									onclick={() => (tokenForm.data.role = r._id)}
								>
									{#if tokenForm.data.role === r._id}
										<span><iconify-icon icon="fa:check" width={24}></iconify-icon></span>
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
			<label for="expires-select" class="mb-2 block text-sm font-medium text-black dark:text-white">{modaltokenuser_tokenvalidity()}</label>
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

		<footer class="modal-footer flex flex-wrap items-center justify-between gap-4 border-t border-surface-500/20 pt-4">
			<div class="flex items-center gap-4">
				<!-- Cancel -->
				<button type="button" class="preset-outlined-secondary-500 btn" onclick={() => modalState.close()}>{button_cancel()}</button>

				<!-- Delete - Only show for existing tokens -->
				{#if tokenForm.data.token}
					<button type="button" onclick={deleteToken} class="preset-filled-error-500 btn">
						<iconify-icon icon="icomoon-free:bin" width={24}></iconify-icon><span class="hidden sm:block">{button_delete()}</span>
					</button>
				{/if}
			</div>

			<!-- Save -->
			<button type="submit" form="token-form" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">{button_save()}</button>
		</footer>
	</form>
</div>
