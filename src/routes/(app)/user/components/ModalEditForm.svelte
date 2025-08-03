<!-- 
@file src/components/ModalEditForm.svelte
@component
**A modal for editing user data like username, email, password, and role**

Efficiently manages user data updates with validation, role selection, and deletion. Optimized for performance and accessibility.

@props
- `parent` {object} - Parent modal properties (regionFooter, onClose, buttonPositive)
- `isGivenData` {boolean} - Whether data is pre-provided (default: false)
- `username` {string|null} - Pre-filled username (default: null)
- `email` {string|null} - Pre-filled email (default: null)
- `role` {string|null} - Pre-filled role (default: null)
- `user_id` {string|null} - User ID to edit (default: null)
-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	// Skeleton & Stores
	import type { ModalComponent } from '@skeletonlabs/skeleton';
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Get data from page store
	const { roles, user } = page.data;
	const isFirstUser = page.data.isFirstUser;

	// Components
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	// Config for the general edit form permissions
	const modaleEditFormConfig = {
		name: 'Admin User Edit Form',
		description: 'Allows admins to manage user accounts, including editing and assigning roles.',
		contextId: 'user:manage',
		action: 'manage',
		contextType: 'user'
	};

	// Config for delete permission guard
	const deleteUserPermissionConfig = {
		name: 'Delete User',
		description: 'Allows deleting a user account.',
		contextId: 'user:delete',
		action: 'delete',
		contextType: 'user'
	};

	// Props
	interface Props {
		parent: ModalComponent['props'] & { regionFooter?: string; onClose?: (event: MouseEvent) => void; buttonPositive?: string };
		isGivenData?: boolean;
		username?: string | null;
		email?: string | null;
		role?: string | null;
		user_id?: string | null;
	}
	let { parent, isGivenData = false, username = null, email = null, role = null, user_id = null }: Props = $props();

	// Store initialization
	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Form Data Initialization
	const formData = $state({
		user_id: isGivenData ? user_id : user?._id,
		username: isGivenData ? (username ?? '') : (user?.username ?? ''),
		email: isGivenData ? (email ?? '') : (user?.email ?? ''),
		password: '',
		confirmPassword: '',
		role: isGivenData ? (role ?? '') : (user?.role ?? '')
	});

	let showPassword = $state(false);
	const errorStatus = $state({
		username: { status: false, msg: '' },
		email: { status: false, msg: '' },
		password: { status: false, msg: '' },
		confirm: { status: false, msg: '' }
	});
	const isOwnProfile = formData.user_id === user?._id || !isGivenData;
	const canChangePassword = isOwnProfile || user?.isAdmin;

	// Check if user has delete permission for layout purposes
	const hasDeletePermission = user?.isAdmin || user?.role === 'admin';
	const showDeleteButton = hasDeletePermission && !isOwnProfile && !isFirstUser;

	function onFormSubmit(event: SubmitEvent): void {
		event.preventDefault();

		// Validate password fields if they are filled
		if (formData.password || formData.confirmPassword) {
			if (formData.password !== formData.confirmPassword) {
				errorStatus.confirm = { status: true, msg: m.formSchemas_Passwordmatch() };
				return;
			}
			if (formData.password.length > 0 && formData.password.length < 8) {
				errorStatus.password = { status: true, msg: m.formSchemas_PasswordMessage({ passwordStrength: '8' }) };
				return;
			}
		}

		// Track what changed for smart toast messages
		const changes: string[] = [];
		const originalData = {
			username: isGivenData ? username : user?.username,
			email: isGivenData ? email : user?.email,
			role: isGivenData ? role : user?.role
		};

		// Check what actually changed
		if (formData.username !== originalData.username) {
			changes.push('username');
		}
		if (!isOwnProfile && formData.role !== originalData.role) {
			const oldRole = roles?.find((r: any) => r._id === originalData.role)?.name || originalData.role;
			const newRole = roles?.find((r: any) => r._id === formData.role)?.name || formData.role;
			changes.push(`role (${oldRole} → ${newRole})`);
		}
		if (formData.password && formData.password.trim() !== '') {
			changes.push('password');
		}

		// Create a clean data object, conditionally including password fields
		const submitData: Record<string, any> = {
			user_id: formData.user_id,
			username: formData.username,
			email: formData.email,
			_changes: changes // Include changes for the response handler
		};

		// Only include role if user is not editing their own profile
		if (!isOwnProfile) {
			submitData.role = formData.role;
		}

		// Only include password fields if they're not empty
		if (formData.password && formData.password.trim() !== '') {
			submitData.password = formData.password;
			submitData.confirmPassword = formData.confirmPassword;
		}

		// Access the current modal from the store
		if ($modalStore[0]?.response) {
			$modalStore[0].response(submitData);
		}
		modalStore.close();
	}

	async function deleteUser() {
		if (!formData.user_id) return;
		try {
			const response = await fetch('/api/user/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userIds: [formData.user_id],
					action: 'delete'
				})
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Failed to delete user.');
			}

			// Use the success message from the API response
			const successMessage = data.message || 'User deleted successfully.';
			toastStore.trigger({
				message: `<iconify-icon icon="mdi:check" width="24"/> ${successMessage}`,
				background: 'variant-filled-success',
				timeout: 3000
			});

			await invalidateAll();
			modalStore.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred.';
			toastStore.trigger({
				message: `<iconify-icon icon="mdi:alert-circle" width="24"/> ${message}`,
				background: 'variant-filled-error',
				timeout: 5000
			});
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class="text-center dark:text-primary-500 {cHeader}">
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>
		<form class="modal-form {cForm}" id="change_user_form" onsubmit={onFormSubmit}>
			<!-- Username -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:user-circle" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
				<FloatingInput
					type="text"
					name="username"
					label={m.form_username()}
					bind:value={formData.username}
					onkeydown={() => (errorStatus.username.status = false)}
					required
					disabled={isGivenData && user_id !== user?._id}
					autocomplete="username"
				/>
				{#if errorStatus.username.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">{errorStatus.username.msg}</div>
				{/if}
			</div>

			<!-- Email -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
				<FloatingInput
					type="email"
					name="email"
					label="Email"
					bind:value={formData.email}
					onkeydown={() => (errorStatus.email.status = false)}
					required
					disabled
					autocomplete="email"
				/>
				{#if errorStatus.email.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">{errorStatus.email.msg}</div>
				{/if}
			</div>

			<!-- Password Change Section -->
			{#if canChangePassword}
				{#if !isOwnProfile && user?.isAdmin}
					<div class="mb-4 rounded-md bg-warning-50 p-3 text-sm text-warning-800 dark:bg-warning-900/20 dark:text-warning-200">
						<div class="flex">
							<iconify-icon icon="mdi:information" width="16" class="mr-2 mt-0.5 flex-shrink-0"></iconify-icon>
							<div>
								<strong>Admin Password Reset:</strong> You are setting a new password for this user. Leave empty to keep current password unchanged.
							</div>
						</div>
					</div>
				{/if}

				<!-- Password field -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
					<FloatingInput
						type="password"
						name="password"
						id="password"
						label={isOwnProfile ? m.modaleditform_newpassword() : 'Set New Password'}
						bind:value={formData.password}
						bind:showPassword
						onkeydown={() => (errorStatus.password.status = false)}
						autocomplete="new-password"
					/>
					{#if errorStatus.password.status}
						<div class="absolute left-0 top-11 text-xs text-error-500">{errorStatus.password.msg}</div>
					{/if}
				</div>

				<!-- Password Confirm -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
					<FloatingInput
						type="password"
						name="confirm_password"
						id="confirm_password"
						label={m.form_confirmpassword()}
						bind:value={formData.confirmPassword}
						bind:showPassword
						onkeydown={() => (errorStatus.confirm.status = false)}
						autocomplete="new-password"
					/>
					{#if errorStatus.confirm.status}
						<div class="absolute left-0 top-11 text-xs text-error-500">{errorStatus.confirm.msg}</div>
					{/if}
				</div>
			{/if}

			<!-- Role Select -->
			<PermissionGuard config={modaleEditFormConfig} silent={true}>
				{#if !isOwnProfile}
					<div class="flex flex-col gap-2 sm:flex-row">
						<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.form_userrole()}</div>
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
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<div class="flex flex-col gap-2 sm:flex-row">
						<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.form_userrole()}</div>
						<div class="flex-auto">
							<div class="rounded-md bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
								<div class="flex items-center">
									<iconify-icon icon="mdi:information" width="16" class="mr-2 flex-shrink-0"></iconify-icon>
									<div>
										<strong>Current Role:</strong>
										{roles?.find((r: any) => r._id === formData.role)?.name || formData.role}
										<br />
										<em>You cannot change your own role for security reasons.</em>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</PermissionGuard>
		</form>
		<footer class="modal-footer {parent.regionFooter} flex {showDeleteButton ? 'justify-between' : 'justify-end'}">
			<!-- Delete User Button -->
			{#if showDeleteButton}
				<PermissionGuard config={deleteUserPermissionConfig} silent={true}>
					<button type="button" onclick={deleteUser} class="variant-filled-error btn">
						<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
						<span class="hidden sm:block">{m.button_delete()}</span>
					</button>
				</PermissionGuard>
			{/if}

			<div class="flex gap-4">
				<!-- Cancel -->
				<button type="button" class="variant-outline-secondary btn" onclick={parent.onClose}>{m.button_cancel()}</button>
				<!-- Save -->
				<button type="submit" form="change_user_form" class="variant-filled-tertiary btn dark:variant-filled-primary {parent.buttonPositive}">
					{m.button_save()}
				</button>
			</div>
		</footer>
	</div>
{/if}
