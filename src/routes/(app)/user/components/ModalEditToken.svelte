<!-- 
@files src/routes/(app)/user/components/ModalEditToken.svelte
@component
**Modal for editing or creating user registration tokens**

Manages token creation and updates with role selection and expiration settings. Optimized for performance, consistency, and accessibility.

@props
- `parent` {object} - Parent modal properties (regionFooter, onClose, buttonPositive)
- `token` {string} - Existing token (default: '')
- `email` {string} - Associated email (default: '')
- `role` {string} - Token role (default: 'user')
- `expires` {string} - Expiration date (default: '7d')
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

	let { parent = { regionFooter: 'modal-footer p-4' }, token = '', email = '', role = 'user', expires = '7d', user_id = '' }: Props = $props();

	let formElement: HTMLFormElement | null = $state(null);

	// Form Data
	const formData = $state({
		user_id: user_id || '',
		email: email || '',
		token: token || '',
		role: role || 'user', // Default to user role
		expires: expires || '7d' // Default to 7 days
	});

	const errorStatus = $state({
		user_id: { status: false, msg: '' },
		email: { status: false, msg: '' },
		token: { status: false, msg: '' }
	});

	// Custom submit function to pass the response and close the modal
	async function onFormSubmit(): Promise<void> {
		// Validate required fields
		if (!formData.email) {
			errorStatus.email = { status: true, msg: 'Email is required' };
			return;
		}
		if (!formData.user_id) {
			errorStatus.user_id = { status: true, msg: 'Username is required' };
			return;
		}

		// Email format validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(formData.email)) {
			errorStatus.email = { status: true, msg: 'Invalid email format' };
			return;
		}

		try {
			const isEditMode = !!formData.token;
			const endpoint = isEditMode ? '/api/user/editToken' : '/api/user/createToken';
			const method = isEditMode ? 'PUT' : 'POST';

			const response = await fetch(endpoint, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					...(isEditMode ? { tokenId: formData.token } : {}),
					email: formData.email,
					user_id: formData.user_id,
					role: formData.role || 'user',
					expiresIn: convertExpiresToHours(formData.expires) || 168, // Default to 7 days (168 hours)
					expiresInLabel: formData.expires || '7d'
				})
			});

			if (response.ok) {
				const responseData = await response.json();
				const successMessage = isEditMode ? 'Token updated successfully' : 'Token created successfully';

				const t = {
					message: `<iconify-icon icon="mdi:check" color="white" width="24" class="mr-1"></iconify-icon> ${successMessage}`,
					background: 'gradient-tertiary',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);

				// Update form data with response values
				if (!isEditMode && responseData.token) {
					formData.token = responseData.token.value;
					formData.expires = formatExpires(responseData.token.expires);
				}

				modalStore.close();
				await invalidateAll();

				// If new token created, send email
				if (!isEditMode && responseData.token) {
					await fetch('/api/sendMail', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							email: formData.email,
							template: 'userToken',
							data: {
								username: formData.user_id,
								token: responseData.token.value,
								expires: formData.expires,
								role: formData.role,
								sitename: import.meta.env.PUBLIC_SITE_NAME || 'SveltyCMS'
							}
						})
					});
				}
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
			modalStore.close();
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
					message: '<iconify-icon icon="mdi:check" color="white" width="24" class="mr-1"></iconify-icon> Registration token deleted successfully',
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
				message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> Failed to delete registration token: ${message}`,
				background: 'variant-filled-error',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
		}
	}

	// Format expiration date for display
	function formatExpires(isoDate: string): string {
		const date = new Date(isoDate);
		const now = new Date();
		const diffHours = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60));

		if (diffHours < 24) {
			return `${diffHours}h`;
		}
		return `${Math.floor(diffHours / 24)}d`;
	}

	// Convert expires string to hours
	function convertExpiresToHours(expires: string): number {
		if (!expires) return 168; // Default 7 days

		const unit = expires.slice(-1);
		const value = parseInt(expires.slice(0, -1));

		switch (unit) {
			case 'h':
				return value;
			case 'd':
				return value * 24;
			default:
				return 168; // Default 7 days
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

			<!-- Username field -->
			<div class="group relative z-0 mb-6 w-full">
				<div class="flex items-center gap-2">
					<div class="flex-1">
						<FloatingInput
							type="text"
							name="username"
							label={m.modaledit_tokenusername()}
							bind:value={formData.user_id}
							onkeydown={() => (errorStatus.user_id.status = false)}
							required
							icon="mdi:user-circle"
						/>
					</div>
					<button
						type="button"
						onclick={() => {
							if (!formData.email) {
								errorStatus.email = { status: true, msg: 'Enter email first' };
								return;
							}
							// Generate username from email
							const base = formData.email.split('@')[0].replace(/[^a-z0-9]/gi, '_');
							const suffix = Math.floor(1000 + Math.random() * 9000); // 4-digit random
							formData.user_id = `${base}_${suffix}`.toLowerCase();
						}}
						class="variant-ghost-secondary btn"
						title="Generate username from email"
					>
						<iconify-icon icon="mdi:auto-fix" width="20"></iconify-icon>
						<span class="sr-only">Auto generate username</span>
					</button>
				</div>
				{#if errorStatus.user_id.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.user_id.msg}
					</div>
				{/if}
			</div>

			<!-- Token field (hidden but still submitted with form) -->
			<input bind:value={formData.token} type="hidden" name="token" required />

			<!-- User Role -->
			{#if user.role == 'admin'}
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
								<p class="text-tertiary-500 dark:text-primary-500">Loading roles...</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Expires field -->
			<div class="group relative z-0 mb-6 w-full">
				<label for="expires-select" class="mb-2 block text-sm font-medium text-black dark:text-white">{m.modaltokenuser_tokenvalidity()} </label>
				<select id="expires-select" bind:value={formData.expires} class="input" aria-label="Token Validity">
					<option value="1h">1 Hour</option>
					<option value="1d">1 Day</option>
					<option value="7d" selected>7 Days (default)</option>
					<option value="30d">30 Days</option>
					<option value="90d">90 Days</option>
				</select>
			</div>
		</form>

		<footer class="modal-footer flex items-center justify-between p-4 {parent?.regionFooter ?? ''}">
			<!-- Delete - Only show for existing tokens -->
			{#if formData.token}
				<button type="button" onclick={deleteToken} class="variant-filled-error btn">
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon><span class="hidden sm:block">{m.button_delete()}</span>
				</button>
			{:else}
				<div></div>
				<!-- Empty div to maintain flex spacing -->
			{/if}

			<div class="{formData.token ? 'justify-center' : 'w-full justify-between '} flex gap-2">
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
