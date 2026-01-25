<!-- 
@file src/routes/(app)/user/components/ModalEditForm.svelte
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

	// Lucide icons

	// Skeleton & stores
	import { modalState } from '@utils/modalState.svelte';
	import { toaster } from '@stores/store.svelte.ts';
	import { editUserSchema } from '@utils/formSchemas';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Get data from page store
	const { roles, user } = page.data;
	const isFirstUser = page.data.isFirstUser;

	// Components
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import { Form } from '@root/src/utils/Form.svelte';

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
		parent?: any; // Was ModalComponent['props']
		isGivenData?: boolean;
		username?: string | null;
		email?: string | null;
		role?: string | null;
		user_id?: string | null;
		title?: string;
		body?: string;
	}
	const { isGivenData = false, username = null, email = null, role = null, user_id = null }: Props = $props();

	// Store initialization

	// Form Data Initialization
	const editForm = new Form(
		{
			user_id: '',
			username: '',
			email: '',
			password: '',
			confirmPassword: '',
			currentPassword: '',
			role: ''
		},
		editUserSchema
	);

	$effect(() => {
		editForm.data.user_id = isGivenData ? user_id : user?._id;
		editForm.data.username = isGivenData ? (username ?? '') : (user?.username ?? '');
		editForm.data.email = isGivenData ? (email ?? '') : (user?.email ?? '');
		editForm.data.role = isGivenData ? (role ?? '') : (user?.role ?? '');
	});

	let showPassword = $state(false);
	const isOwnProfile = $derived(editForm.data.user_id === user?._id || !isGivenData);
	const canChangePassword = $derived(isOwnProfile || user?.isAdmin);

	// Check if user has delete permission for layout purposes
	const hasDeletePermission = user?.isAdmin || user?.role === 'admin';
	const showDeleteButton = $derived(hasDeletePermission && !isOwnProfile && !isFirstUser);

	async function onFormSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();

		if (!editForm.validate()) {
			return;
		}

		editForm.submitting = true;

		// Track what changed for smart toast messages
		const changes: string[] = [];
		const originalData = {
			username: isGivenData ? username : user?.username,
			email: isGivenData ? email : user?.email,
			role: isGivenData ? role : user?.role
		};

		// Check what actually changed
		if (editForm.data.username !== originalData.username) {
			changes.push('username');
		}
		if (!isOwnProfile && editForm.data.role !== originalData.role) {
			const oldRole = roles?.find((r: any) => r._id === originalData.role)?.name || originalData.role;
			const newRole = roles?.find((r: any) => r._id === editForm.data.role)?.name || editForm.data.role;
			changes.push(`role (${oldRole} → ${newRole})`);
		}
		if (editForm.data.password && editForm.data.password.trim() !== '') {
			changes.push('password');
		}

		// Create a clean data object for the API call (just the user fields)
		const submitData: Record<string, any> = {
			username: editForm.data.username,
			email: editForm.data.email
		};

		// Only include role if user is not editing their own profile
		if (!isOwnProfile) {
			submitData.role = editForm.data.role;
		}

		// Only include password fields if they're not empty
		if (editForm.data.password && editForm.data.password.trim() !== '') {
			submitData.password = editForm.data.password;
			if (isOwnProfile) {
				submitData.currentPassword = editForm.data.currentPassword;
			}
		}

		try {
			const response = await fetch('/api/user/updateUserAttributes', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: editForm.data.user_id,
					newUserData: submitData
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to update user.');
			}

			toaster.success({
				description: '<iconify-icon icon="mdi:check-outline" width={24} ></iconify-icon> User Data Updated'
			});
			await invalidateAll();
			// modalStore.close();
			modalState.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred.';
			toaster.error({ description: `<CircleAlert size={24}/> ${message}` });
		} finally {
			editForm.submitting = false;
		}
	}

	let isCurrentPasswordValidated = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

	function debounceVerifyCurrentPassword() {
		clearTimeout(debounceTimer);
		isCurrentPasswordValidated = false;
		editForm.errors.currentPassword = [];

		if (!editForm.data.currentPassword) return;

		debounceTimer = setTimeout(() => {
			verifyCurrentPassword();
		}, 800); // 800ms delay
	}

	async function verifyCurrentPassword() {
		if (!editForm.data.currentPassword) return;
		try {
			const res = await fetch('/api/user/verifyPassword', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: editForm.data.currentPassword })
			});
			const data = await res.json();
			if (data.valid) {
				isCurrentPasswordValidated = true;
				editForm.errors.currentPassword = [];
				toaster.success({ description: 'Password verified', duration: 5000 });
			} else {
				isCurrentPasswordValidated = false;
				editForm.errors.currentPassword = ['Incorrect password'];
			}
		} catch (e) {
			console.error(e);
			editForm.errors.currentPassword = ['Error verifying password'];
		}
	}

	async function deleteUser() {
		if (!editForm.data.user_id) return;
		try {
			const response = await fetch('/api/user/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userIds: [editForm.data.user_id],
					action: 'delete'
				})
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Failed to delete user.');
			}

			// Use the success message from the API response
			const successMessage = data.message || 'User deleted successfully.';
			toaster.success({ description: `<iconify-icon icon="mdi:alert-circle" width={24}></iconify-icon> ${successMessage}` });

			await invalidateAll();
			// modalStore.close();
			modalState.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred.';
			toaster.error({ description: `<CircleAlert size={24}/> ${message}` });
		}
	}

	// Base Classes
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="modal-example-form space-y-4 text-black dark:text-white">
	<form class="modal-form {cForm} grid grid-cols-1 gap-4" id="change_user_form" onsubmit={onFormSubmit}>
		<!-- Username -->
		<FloatingInput
			type="text"
			name="username"
			label={m.username()}
			bind:value={editForm.data.username}
			onkeydown={() => (editForm.errors.username = [])}
			required
			disabled={isGivenData && user_id !== user?._id}
			autocomplete="username"
			icon="mdi:user-circle"
			textColor="text-tertiary-500 dark:text-white"
			invalid={!!editForm.errors.username?.length}
			errorMessage={editForm.errors.username?.[0]}
		/>

		<!-- Email -->
		<FloatingInput
			type="email"
			name="email"
			label="Email"
			bind:value={editForm.data.email}
			onkeydown={() => (editForm.errors.email = [])}
			required
			disabled
			autocomplete="email"
			icon="mdi:email"
			textColor="text-tertiary-500 dark:text-white"
			invalid={!!editForm.errors.email?.length}
			errorMessage={editForm.errors.email?.[0]}
		/>

		<!-- Password Change Section -->
		{#if canChangePassword}
			{#if !isOwnProfile && user?.isAdmin}
				<div class="mb-4 rounded-md bg-warning-50 p-3 text-sm text-warning-800 dark:bg-warning-900/20 dark:text-warning-200">
					<div class="flex">
						<iconify-icon icon="mdi:information" width={16} class="mr-2 mt-0.5 shrink-0"></iconify-icon>
						<div>
							<strong>Admin Password Reset:</strong> You are setting a new password for this user. Leave empty to keep current password unchanged.
						</div>
					</div>
				</div>
			{/if}

			{#if isOwnProfile}
				<!-- Current Password (Required for own profile password change) -->
				<FloatingInput
					type="password"
					name="current_password"
					id="current_password"
					label="Current Password"
					bind:value={editForm.data.currentPassword}
					bind:showPassword
					onkeydown={() => (editForm.errors.currentPassword = [])}
					onInput={debounceVerifyCurrentPassword}
					onblur={() => {
						clearTimeout(debounceTimer);
						verifyCurrentPassword();
					}}
					autocomplete="current-password"
					icon="mdi:key"
					textColor={isCurrentPasswordValidated ? 'text-success-500' : 'text-tertiary-500 dark:text-white'}
					passwordIconColor="text-tertiary-500 dark:text-white"
					invalid={!!editForm.errors.currentPassword?.length}
					errorMessage={editForm.errors.currentPassword?.[0]}
				/>
			{/if}

			<!-- Password field -->
			<div class:opacity-50={isOwnProfile && !isCurrentPasswordValidated} class="transition-opacity duration-200">
				<FloatingInput
					type="password"
					name="password"
					id="password"
					label={isOwnProfile ? m.modaleditform_newpassword() : 'Set New Password'}
					bind:value={editForm.data.password}
					bind:showPassword
					onkeydown={() => (editForm.errors.password = [])}
					autocomplete="new-password"
					icon="mdi:password"
					textColor="text-tertiary-500 dark:text-white"
					passwordIconColor="text-tertiary-500 dark:text-white"
					invalid={!!editForm.errors.password?.length}
					errorMessage={editForm.errors.password?.[0]}
					disabled={isOwnProfile && !isCurrentPasswordValidated}
				/>
			</div>

			<!-- Password Confirm -->
			<div class:opacity-50={isOwnProfile && !isCurrentPasswordValidated} class="transition-opacity duration-200">
				<FloatingInput
					type="password"
					name="confirm_password"
					id="confirm_password"
					label={m.confirm_password?.() || m.form_confirmpassword?.()}
					bind:value={editForm.data.confirmPassword}
					bind:showPassword
					onkeydown={() => (editForm.errors.confirmPassword = [])}
					autocomplete="new-password"
					icon="mdi:password"
					textColor="text-tertiary-500 dark:text-white"
					passwordIconColor="text-tertiary-500 dark:text-white"
					invalid={!!editForm.errors.confirmPassword?.length}
					errorMessage={editForm.errors.confirmPassword?.[0]}
					disabled={isOwnProfile && !isCurrentPasswordValidated}
				/>
			</div>

			{#if isOwnProfile && !isCurrentPasswordValidated}
				<div class="text-xs text-center text-surface-500 dark:text-surface-50 pl-1">
					<iconify-icon icon="mdi:lock" class="inline-block align-text-bottom mr-1"></iconify-icon>
					Enter your current password correctly to unlock new password fields.
				</div>
			{/if}
		{/if}
		<!-- Role Select -->
		<PermissionGuard config={modaleEditFormConfig} silent={true}>
			{#if !isOwnProfile}
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.role()}</div>
					<div class="flex-auto">
						<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
							{#if roles && roles.length > 0}
								{#each roles as r}
									<button
										type="button"
										class="chip {editForm.data.role === r._id ? 'preset-filled-tertiary-500' : 'preset-ghost-secondary-500'}"
										onclick={() => (editForm.data.role = r._id)}
									>
										{#if editForm.data.role === r._id}
											<iconify-icon icon="fa:check" width={16}></iconify-icon>
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
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.role()}</div>
					<div class="flex-auto">
						<div class="rounded-md bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
							<div class="flex items-center">
								<iconify-icon icon="mdi:information" width={16} class="mr-2 shrink-0"></iconify-icon>
								<div>
									<strong>Current Role:</strong>
									{roles?.find((r: any) => r._id === editForm.data.role)?.name || editForm.data.role}
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

	<footer class="modal-footer flex flex-wrap items-center justify-between gap-4 border-t border-surface-500/20 pt-4">
		<div class="flex items-center gap-4">
			<!-- Cancel -->
			<button type="button" class="preset-outlined-secondary-500 btn" onclick={() => modalState.close()}>{m.button_cancel()}</button>

			<!-- Delete User Button (only if perm allows) -->
			{#if showDeleteButton}
				<PermissionGuard config={deleteUserPermissionConfig} silent={true}>
					<button type="button" onclick={deleteUser} class="preset-filled-error-500 btn">
						<iconify-icon icon="icomoon-free:bin" width={24}></iconify-icon>
						<span class="hidden sm:block">{m.button_delete()}</span>
					</button>
				</PermissionGuard>
			{/if}
		</div>

		<!-- Save -->
		<button type="submit" form="change_user_form" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">
			{m.button_save()}
		</button>
	</footer>
</div>
