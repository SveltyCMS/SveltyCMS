<!--
@file src/routes/(app)/user/components/modal-edit-token.svelte
@component
**Modal for editing or creating user registration tokens**

This component provides a form to create new registration tokens or edit existing ones.
It handles token creation, updates, and deletion with proper validation and error handling.

### Features:
- Seeded form state with legacy expiration format conversion
- Token creation with copyable invitation link and raw token fallback
- Token update and deletion with CSRF protection

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
	import Select from '@components/ui/select.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	// ParaglideJS
	import {
		button_cancel,
		button_delete,
		button_save,
		email as m_email,
		modal_token_deleted_successfully,
		modaltokenuser_tokenvalidity,
		role as m_role,
		usertoken_close,
		usertoken_copied_description,
		usertoken_copied_title,
		usertoken_copy_hint,
		usertoken_copy_invitation_link,
		usertoken_copy_raw_token,
		usertoken_created,
		usertoken_delete_failed,
		usertoken_dev_mode_skipped,
		usertoken_email_delayed_hint,
		usertoken_error_title,
		usertoken_expires_12_hours,
		usertoken_expires_1_month,
		usertoken_expires_1_week,
		usertoken_expires_2_days,
		usertoken_expires_2_hours,
		usertoken_expires_2_weeks,
		usertoken_info_title,
		usertoken_input_aria,
		usertoken_invitation_created,
		usertoken_invitation_link,
		usertoken_link_label,
		usertoken_no_roles,
		usertoken_operation_failed,
		usertoken_raw_token,
		usertoken_smtp_not_configured,
		usertoken_success_title,
		usertoken_token_created_title,
		usertoken_token_label,
		usertoken_token_name_aria,
		usertoken_token_value_aria,
		usertoken_unknown_error,
		usertoken_updated,
		usertoken_user_token_created,
		usertoken_warning_title
	} from '@src/paraglide/messages';

	// Native UI Components & Stores
	import { toast } from '@src/stores/toast.svelte.ts';
	import { Form } from '@utils/form.svelte.ts';
	import { addUserTokenSchema } from '@utils/schemas';
	// Utils
	import { modalState } from '@utils/modal.svelte';
	import { untrack } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { dateToISODateString } from '@utils/date';
	import { convertExpiresToHours, convertLegacyExpiresFormat } from '../user-remote-utils';

	// Props
	interface Props {
		close?: (val?: unknown) => void;
		email?: string;
		expires?: string;
		role?: string;
		roles?: Array<{ _id: string; name: string }>;
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

	function resolveInitialValues() {
		return {
			user_id: user_id ?? '',
			email: email ?? '',
			token: token ?? '',
			role: role || 'admin',
			expiresIn: !expires || expires === '' ? '2 days' : convertLegacyExpiresFormat(expires)
		};
	}

	const initialValues = untrack(() => resolveInitialValues());

	const tokenForm = new Form(
		{
			user_id: initialValues.user_id,
			email: initialValues.email,
			token: initialValues.token,
			role: initialValues.role,
			expiresIn: initialValues.expiresIn
		},
		addUserTokenSchema
	);

	// Re-seed only when the target token identity changes (never clobber active typing).
	let seededTokenKey = untrack(
		() => `${initialValues.token}:${initialValues.user_id}:${initialValues.email}`
	);
	$effect(() => {
		const next = resolveInitialValues();
		const nextKey = `${next.token}:${next.user_id}:${next.email}`;
		if (nextKey !== seededTokenKey) {
			seededTokenKey = nextKey;
			tokenForm.data.user_id = next.user_id;
			tokenForm.data.email = next.email;
			tokenForm.data.token = next.token;
			tokenForm.data.role = next.role;
			tokenForm.data.expiresIn = next.expiresIn;
		}
	});

	// State for the newly created token
	let createdToken = $state('');
	let invitationLink = $derived(
		createdToken ? `${page.url.origin}/login?invite_token=${createdToken}` : ''
	);

	function closeDialog(result?: unknown): void {
		if (close) {
			close(result);
		} else {
			modalState.close(result);
		}
	}

	async function onFormSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();

		if (!tokenForm.validate()) {
			return;
		}

		tokenForm.submitting = true;

		try {
			const isEditMode = !!tokenForm.data.token;
			const endpoint = isEditMode
				? `/api/token/${tokenForm.data.token}`
				: '/api/token/create-token';
			const method = isEditMode ? 'PUT' : 'POST';

			const body = isEditMode
				? {
						newTokenData: {
							email: tokenForm.data.email,
							role: tokenForm.data.role,
							// The update handler allowlists `expires` (lifecycle field);
							// `expiresInHours` is not a token column and was dropped, so the
							// validity selector silently no-op'd. Send a concrete ISO date.
							expires: dateToISODateString(
								new Date(
									Date.now() + convertExpiresToHours(tokenForm.data.expiresIn) * 60 * 60 * 1000
								)
							)
						}
					}
				: {
						email: tokenForm.data.email,
						role: tokenForm.data.role,
						expiresIn: tokenForm.data.expiresIn // Send the API format directly
					};

			const response = await fetch(endpoint, {
				method,
				headers: clientJsonHeaders(page.data.csrfToken),
				body: JSON.stringify(body)
			});
			const responseData = await response.json();

			if (!response.ok) {
				throw new Error(responseData.message || usertoken_operation_failed());
			}

			// Store the created token if it's a new one
			if (!isEditMode && responseData.token) {
				createdToken = responseData.token.value || responseData.token.token || '';
			}

			// Check if SMTP is not configured
			if (responseData.smtp_not_configured) {
				toast.warning({
					title: usertoken_warning_title(),
					description: usertoken_smtp_not_configured({
						status: isEditMode ? usertoken_updated() : usertoken_created()
					})
				});
			} else if (responseData.dev_mode && !responseData.email_sent) {
				// Email was skipped due to dev mode or dummy config
				toast.info({
					title: usertoken_info_title(),
					description: usertoken_dev_mode_skipped({
						status: isEditMode ? usertoken_updated() : usertoken_created()
					})
				});
			} else {
				// Success - email sent
				toast.success({
					title: usertoken_success_title(),
					description: isEditMode ? usertoken_updated() : usertoken_user_token_created()
				});
			}

			// Invalidate data first
			await refreshAll();

			// If it's a new token and we have the value, don't close yet so user can copy it
			if (!isEditMode && createdToken) {
				toast.info({
					title: usertoken_token_created_title(),
					description: usertoken_copy_hint()
				});
			} else {
				closeDialog({ success: true });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : usertoken_unknown_error();
			toast.error({ title: usertoken_error_title(), description: message });
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
				headers: clientJsonHeaders(page.data.csrfToken)
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || usertoken_delete_failed());
			}
			if (data?.data?.deletedCount === 0) {
				// The API can resolve by value or _id; an unknown id must not toast success.
				throw new Error(data.message || usertoken_delete_failed());
			}

			toast.success({
				title: usertoken_success_title(),
				description: modal_token_deleted_successfully()
			});
			await refreshAll();

			closeDialog({ success: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : usertoken_delete_failed();
			toast.error({ title: usertoken_error_title(), description: message });
		}
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard.writeText(text).then(() => {
			toast.success({
				title: usertoken_copied_title(),
				description: usertoken_copied_description({ label })
			});
		});
	}
</script>

<div class="modal-example-form space-y-4 text-(--admin-text-body) p-4">
	{#if createdToken}
		<div
			class="card p-6 space-y-4 bg-success-500/10 border border-success-500/30 rounded-lg shadow-lg"
		>
			<h3 class="text-xl font-bold text-success-600 dark:text-success-400">
				{usertoken_invitation_created()}
			</h3>
			<p class="text-sm opacity-80">
				{usertoken_email_delayed_hint()}
			</p>

			<div class="flex flex-col gap-4">
				<label class="label">
					<span class="text-xs uppercase font-bold opacity-60">{usertoken_invitation_link()}</span>
					<div class="flex gap-2 mt-1">
						<input
							aria-label={usertoken_token_name_aria()}
							type="text"
							readonly
							value={invitationLink}
							class="input flex-1"
						/>
						<Button
							variant="primary"
							type="button"
							onclick={() => copyToClipboard(invitationLink, usertoken_link_label())}
							aria-label={usertoken_copy_invitation_link()}
							class="shrink-0"
						>
							<iconify-icon icon="mdi:content-copy" width="20"></iconify-icon>
						</Button>
					</div>
				</label>

				<label class="label">
					<span class="text-xs uppercase font-bold opacity-60">{usertoken_raw_token()}</span>
					<div class="flex gap-2 mt-1">
						<input
							aria-label={usertoken_token_value_aria()}
							type="text"
							readonly
							value={createdToken}
							class="input flex-1"
						/>
						<Button
							variant="outline"
							type="button"
							onclick={() => copyToClipboard(createdToken, usertoken_token_label())}
							aria-label={usertoken_copy_raw_token()}
							class="shrink-0"
						>
							<iconify-icon icon="mdi:content-copy" width="20"></iconify-icon>
						</Button>
					</div>
				</label>
			</div>

			<div class="flex justify-end pt-4">
				<Button
					variant="outline"
					type="button"
					onclick={() => closeDialog({ success: true })}
					class="px-8">{usertoken_close()}</Button
				>
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
			<input
				bind:value={tokenForm.data.token}
				type="hidden"
				name="token"
				aria-label={usertoken_input_aria()}
			/>

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
									class={tokenForm.data.role === r._id
										? 'bg-tertiary-500 text-white dark:bg-primary-500 dark:text-white'
										: 'border-surface-500/30 text-(--admin-text-muted) opacity-70'}
									onclick={() => (tokenForm.data.role = r._id)}
								>
									{#if tokenForm.data.role === r._id}
										<span><iconify-icon icon="fa:check" width={16}></iconify-icon></span>
									{/if}
									<span class="capitalize">{r.name}</span>
								</Button>
							{/each}
						{:else}
							<div class="text-sm text-(--admin-text-muted) italic">{usertoken_no_roles()}</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Expires field -->
			<div class="group relative z-0 w-full mt-2">
				<Select
					id="expires-select"
					label={modaltokenuser_tokenvalidity()}
					bind:value={tokenForm.data.expiresIn}
					options={[
						{ value: '2 hrs', label: usertoken_expires_2_hours() },
						{ value: '12 hrs', label: usertoken_expires_12_hours() },
						{ value: '2 days', label: usertoken_expires_2_days() },
						{ value: '1 week', label: usertoken_expires_1_week() },
						{ value: '2 weeks', label: usertoken_expires_2_weeks() },
						{ value: '1 month', label: usertoken_expires_1_month() }
					]}
				/>
			</div>

			<footer
				class="modal-footer flex flex-wrap items-center justify-between gap-4 border-t border-surface-500/20 pt-6 mt-2"
			>
				<div class="flex items-center gap-4">
					<!-- Cancel -->
					<Button variant="outline" type="button" onclick={() => closeDialog()}
						>{button_cancel()}</Button
					>

					<!-- Delete - Only show for existing tokens -->
					{#if tokenForm.data.token}
						<Button variant="error" type="button" onclick={deleteToken}>
							<iconify-icon icon="icomoon-free:bin" width={20}></iconify-icon>
							<span class="hidden sm:block ms-2">{button_delete()}</span>
						</Button>
					{/if}
				</div>

				<!-- Save -->
				<Button variant="tertiary" type="submit" form="token-form" class="px-10">
					{tokenForm.submitting ? '...' : button_save()}
				</Button>
			</footer>
		</form>
	{/if}
</div>
