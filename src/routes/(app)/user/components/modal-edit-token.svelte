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
	import Button from '@components/ui/button.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
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

	// Native UI Components & Stores
	import { toast } from '@src/stores/toast.svelte.ts';
	import { Form } from '@utils/form.svelte.ts';
	import { addUserTokenSchema } from '@utils/schemas';
	// Utils
	import { modalState } from '@utils/modal.svelte';
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
		user_id?: string;
	}

	let {
		token = '',
		user_id = '',
		email = '',
		role = 'admin',
		expires = '',
		roles = page.data.roles,
		close
	}: Props = $props();

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

	// State for the newly created token
	let createdToken = $state('');
	let invitationLink = $derived(createdToken ? `${page.url.origin}/login?invite_token=${createdToken}` : '');

	// Svelte 5 sets `value` as DOM property, not HTML attribute, on client renders.
	// CSS attribute selectors (e.g. input[value*=]) need the HTML attribute to match.
	function syncValueAttr(node: HTMLInputElement) {
		node.setAttribute('value', node.value);
	}

	async function onFormSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();

		if (!tokenForm.validate()) {
			return;
		}

		tokenForm.submitting = true;

		try {
			const isEditMode = !!tokenForm.data.token;
			const endpoint = isEditMode ? `/api/token/${tokenForm.data.token}` : '/api/token/create-token';
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
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				},
				body: JSON.stringify(body)
			});
			const responseData = await response.json();

			if (!response.ok) {
				throw new Error(responseData.message || 'Operation failed');
			}

			// Store the created token if it's a new one
			if (!isEditMode && responseData.token) {
				createdToken = responseData.token.value || responseData.token.token || '';
			}

			// Check if SMTP is not configured
			if (responseData.smtp_not_configured) {
				toast.warning({
					title: 'Warning',
					description: `${isEditMode ? 'Token updated' : 'Token created'} - Email not sent: SMTP not configured. Token is listed in Admin Area.`
				});
			} else if (responseData.dev_mode && !responseData.email_sent) {
				// Email was skipped due to dev mode or dummy config
				toast.info({
					title: 'Info',
					description: `${isEditMode ? 'Token updated' : 'Token created'} - Email sending skipped (dev mode)`
				});
			} else {
				// Success - email sent
				toast.success({ title: 'Success', description: isEditMode ? 'Token updated' : 'User token created' });
			}

			// Invalidate data first
			await invalidateAll();

			// If it's a new token and we have the value, don't close yet so user can copy it
			if (!isEditMode && createdToken) {
				toast.info({
					title: 'Token Created',
					description: 'Please copy the invitation link below or the token itself.'
				});
			} else if (close) {
				close({ success: true });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred';
			toast.error({ title: 'Error', description: message });
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
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				}
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to delete token');
			}

			toast.success({
				title: 'Success',
				description: modal_token_deleted_successfully()
			});
			await invalidateAll();

			if (close) {
				close({ success: true });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete token';
			toast.error({ title: 'Error', description: message });
		}
	}

	function convertExpiresToHours(expires: string): number {
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
				return 48;
		}
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard.writeText(text).then(() => {
			toast.success({ title: 'Copied', description: `${label} copied to clipboard` });
		});
	}
</script>

<div class="modal-example-form space-y-4 text-black dark:text-white p-4">
	{#if createdToken}
		<div class="card p-6 space-y-4 variant-soft-success border border-success-500/30 shadow-lg">
			<h3 class="text-xl font-bold text-success-700 dark:text-success-400">Invitation Token Created</h3>
			<p class="text-sm opacity-80">Since email delivery might be disabled or delayed, you can provide this link to the user directly:</p>

			<div class="flex flex-col gap-4">
				<label class="label">
					<span class="text-xs uppercase font-bold opacity-60">Invitation Link</span>
					<div class="flex gap-2 mt-1">
						<input type="text" readonly value={invitationLink} use:syncValueAttr class="input flex-1" aria-label="Invitation Link" />
						<Button variant="primary" type="button" onclick={() => copyToClipboard(invitationLink, 'Link')} aria-label="Copy invitation link" class="shrink-0">
							<iconify-icon icon="mdi:content-copy" width="20"></iconify-icon>
						</Button>
					</div>
				</label>

				<label class="label">
					<span class="text-xs uppercase font-bold opacity-60">Raw Token</span>
					<div class="flex gap-2 mt-1">
						<input type="text" readonly value={createdToken} class="input flex-1" aria-label="Raw Token" />
						<Button variant="outline" type="button" onclick={() => copyToClipboard(createdToken, 'Token')} aria-label="Copy raw token" class="shrink-0">
							<iconify-icon icon="mdi:content-copy" width="20"></iconify-icon>
						</Button>
					</div>
				</label>
			</div>

			<div class="flex justify-end pt-4">
				<Button variant="outline" type="button" onclick={() => close?.({ success: true })} class="px-8">Close</Button>
			</div>
		</div>
	{:else}
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
			<input bind:value={tokenForm.data.token} type="hidden" name="token"  aria-label="Input" />

			<!-- User Role -->
			<div class="flex flex-col gap-2 sm:flex-row items-center">
				<div class="sm:w-1/4 text-sm opacity-70">{m_role()}:</div>
				<div class="flex-auto w-full">
					<div class="flex flex-wrap gap-2">
						{#if roles && roles.length > 0}
							{#each roles as r (r._id)}
								<Button
									variant="outline"
									type="button"
									class="chip {tokenForm.data.role === r._id
										? 'preset-filled-tertiary-500 dark:preset-filled-primary-500'
										: 'bg-surface-200 dark:bg-surface-100 text-black dark:text-black opacity-60'}"
									onclick={() => (tokenForm.data.role = r._id)}
								>
									{#if tokenForm.data.role === r._id}
										<span><iconify-icon icon="fa:check" width={16}></iconify-icon></span>
									{/if}
									<span class="capitalize">{r.name}</span>
								</Button>
							{/each}
						{:else}
							<div class="text-sm text-gray-500 italic">No roles available.</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Expires field -->
			<div class="group relative z-0 w-full mt-2">
				<label for="expires-select" class="mb-1 block text-sm opacity-70">{modaltokenuser_tokenvalidity()}</label>
				<select aria-label="Token Validity"
					id="expires-select"
					bind:value={tokenForm.data.expiresIn}
					class="input bg-white text-black dark:bg-surface-700 dark:text-white"
				>
					<option value="2 hrs">2 Hours</option>
					<option value="12 hrs">12 Hours</option>
					<option value="2 days">2 Days (default)</option>
					<option value="1 week">1 Week</option>
					<option value="2 weeks">2 Weeks</option>
					<option value="1 month">1 Month</option>
				</select>
			</div>

			<footer class="modal-footer flex flex-wrap items-center justify-between gap-4 border-t border-surface-500/20 pt-6 mt-2">
				<div class="flex items-center gap-4">
					<!-- Cancel -->
					<Button variant="outline" type="button" onclick={() => modalState.close()}>{button_cancel()}</Button>

					<!-- Delete - Only show for existing tokens -->
					{#if tokenForm.data.token}
						<Button variant="error" type="button" onclick={deleteToken}>
							<iconify-icon icon="icomoon-free:bin" width={20}></iconify-icon>
							<span class="hidden sm:block ms-2">{button_delete()}</span>
						</Button>
					{/if}
				</div>

				<!-- Save -->
				<Button variant="tertiary" type="submit" form="token-form" class="dark: px-10">
					{tokenForm.submitting ? '...' : button_save()}
				</Button>
			</footer>
		</form>
	{/if}
</div>
