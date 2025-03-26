<!--
@file src/components/ModalEditForm.svelte
@component
**A modal for editing user data like username, email, password, and role**

Efficiently manages user data updates with validation, role selection, and deletion. Optimized for performance and accessibility.

@props
- `isGivenData` {boolean} - Whether data is pre-provided (default: false)
- `username` {string|null} - Pre-filled username (default: null)
- `email` {string|null} - Pre-filled email (default: null)
- `role` {string|null} - Pre-filled role (default: null)
- `user_id` {string|null} - User ID to edit (default: null)
-->

<script lang="ts">
	import axios from 'axios';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';

	// Skeleton
	import { Modal } from '@skeletonlabs/skeleton-svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';

	import type { PermissionConfig } from '@src/auth/permissionTypes';
	import { PermissionAction } from '@src/auth/permissionTypes';

	// Define permissions for different contexts
	const modaleEditFormConfig: PermissionConfig = {
		contextId: '/user/modaleEditForm',
		name: 'admin',
		action: PermissionAction.READ,
		contextType: 'user'
	};

	// Get data from page store
	const { roles, user } = page.data;

	// Function to check if a role is active
	const isRoleActive = (roleName: string): boolean => {
		return user?.role?.toLowerCase() === roleName.toLowerCase();
	};

	const isFirstUser = page.data.isFirstUser;
	// Props
	const {
		isGivenData = false,
		username = null,
		email = null,
		role = null,
		user_id = null
	} = $props<{
		isGivenData?: boolean;
		username?: string | null;
		email?: string | null;
		role?: string | null;
		user_id?: string | null;
	}>();

	// Modal state
	let openState = $state(false);

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

	// Check if user is editing their own profile
	const isOwnProfile = user_id === user?._id || !isGivenData;

	// Form submission handler
	async function onFormSubmit(): Promise<void> {
		console.log('modal submitted.');
		// Validate password fields if they are filled
		if (formData.password || formData.confirmPassword) {
			if (formData.password !== formData.confirmPassword) {
				errorStatus.confirm.status = true;
				errorStatus.confirm.msg = m.formSchemas_Passwordmatch();
				return;
			}
			if (formData.password.length < 8) {
				errorStatus.password.status = true;
				errorStatus.password.msg = m.formSchemas_PasswordMessage({ passwordStrength: '8' });
				return;
			}
		}

		try {
			const data = { user_id: formData.user_id, newUserData: formData };
			const res = await axios.put('/api/user/updateUserAttributes', data);
			if (res.status === 200) {
				await invalidateAll();
				openState = false;
			}
		} catch (error) {
			console.error('Error updating user:', error);
		}
	}

	// Delete user handler
	async function deleteUser(): Promise<void> {
		try {
			const formDataToSend = new FormData();
			formDataToSend.append('id', user._id);

			const res = await axios.post('?/deleteUser', formDataToSend);
			if (res.status === 200) {
				await invalidateAll();
				openState = false;
			}
		} catch (error) {
			console.error('Error deleting user:', error);
		}
	}
</script>

<Modal
	open={openState}
	onOpenChange={(e) => (openState = e.open)}
	triggerBase="btn preset-tonal"
	contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
	backdropClasses="backdrop-blur-sm"
>
	{#snippet trigger()}
		<button>{m.userpage_edit_usersetting()}</button>
	{/snippet}

	{#snippet content()}
		<header class="text-primary-500 text-center text-2xl font-bold">
			{m.usermodaluser_edittitle()}
		</header>
		<article class="text-center text-sm">
			{m.usermodaluser_editbody()}
		</article>
		<form
			class="border-surface-500 rounded-container space-y-4 border p-4"
			onsubmit={(e) => {
				e.preventDefault();
				onFormSubmit();
			}}
		>
			<!-- Username field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:user-circle" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
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
					<div class="text-error-500 absolute top-11 left-0 text-xs">
						{errorStatus.username.msg}
					</div>
				{/if}
			</div>

			<!-- Admin area -->
			{#if (isGivenData ? role : user?.role) === 'admin'}
				<!-- Email field -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
					<FloatingInput
						type="email"
						name="email"
						label={m.form_emailaddress()}
						bind:value={formData.email}
						onkeydown={() => (errorStatus.email.status = false)}
						required
						disabled
						autocomplete="email"
					/>
					{#if errorStatus.email.status}
						<div class="text-error-500 absolute top-11 left-0 text-xs">
							{errorStatus.email.msg}
						</div>
					{/if}
				</div>
			{:else}
				<!-- Email field (non-editable for normal users) -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
					<FloatingInput
						type="email"
						name="email"
						label="Email Cannot be changed"
						bind:value={formData.email}
						onkeydown={() => (errorStatus.email.status = false)}
						disabled
						autocomplete="email"
					/>
					{#if errorStatus.email.status}
						<div class="text-error-500 absolute top-11 left-0 text-xs">
							{errorStatus.email.msg}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Password Change Section - Available for own profile -->
			{#if isOwnProfile}
				<!-- Password field -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:password" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
					<FloatingInput
						type="password"
						name="password"
						id="password"
						label={m.modaleditform_newpassword()}
						bind:value={formData.password}
						bind:showPassword
						onkeydown={() => (errorStatus.password.status = false)}
						autocomplete="new-password"
					/>
					{#if errorStatus.password.status}
						<div class="text-error-500 absolute top-11 left-0 text-xs">
							{errorStatus.password.msg}
						</div>
					{/if}
				</div>

				<!-- Password Confirm -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:password" width="18" class="absolute top-3.5 left-0 text-gray-400"></iconify-icon>
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
						<div class="text-error-500 absolute top-11 left-0 text-xs">
							{errorStatus.confirm.msg}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Role Select -->
			<PermissionGuard config={modaleEditFormConfig}>
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.form_userrole()}</div>
					<div class="flex-auto">
						<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
							{#if roles && roles.length > 0}
								{#each roles as role}
									<button
										type="button"
										class="chip {isRoleActive(role._id) ? 'preset-filled-tertiary-500' : 'preset-tonal-secondary border-secondary-500 border'}"
										onclick={() => (formData.role = role._id)}
									>
										{#if isRoleActive(role._id)}
											<span><iconify-icon icon="fa:check"></iconify-icon></span>
										{/if}
										<span class="capitalize">{role.name}</span>
									</button>
								{/each}
							{:else}
								<p class="text-tertiary-500 dark:text-primary-500">Loading roles...</p>
							{/if}
						</div>
					</div>
				</div>
			</PermissionGuard>

			<footer class="flex items-center justify-between">
				<!-- Delete User -->
				{#if isFirstUser}
					<button
						type="button"
						onclick={deleteUser}
						class="preset-filled-error-500 btn"
						disabled={!isFirstUser && (!isGivenData || user._id === user_id)}
					>
						<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
						<span class="hidden sm:block">{m.button_delete()}</span>
					</button>
				{:else}
					<div></div>
					<!-- Empty div when isFirstUser -->
				{/if}

				<div class="flex justify-between gap-4">
					<!-- Cancel -->
					<button type="button" class="preset-outline-secondary btn" onclick={() => (openState = false)}>
						{m.button_cancel()}
					</button>
					<!-- Save -->
					<button type="submit" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">
						{m.button_save()}
					</button>
				</div>
			</footer>
		</form>
	{/snippet}
</Modal>
