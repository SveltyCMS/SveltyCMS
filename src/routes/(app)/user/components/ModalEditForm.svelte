<!-- 
@file src/components/ModalEditForm.svelte
@component
**A modal for editing user data like username, email, password, and role**
-->

<script lang="ts">
	import axios from 'axios';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';

	// Props

	// Skelton & Stores
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Get data from page store
	const { roles, user } = $page.data;

	// Function to check if a role is active
	const isRoleActive = (roleName: string): boolean => {
		return user?.role?.toLowerCase() === roleName.toLowerCase();
	};
	// Components
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';

	import type { PermissionConfig } from '@src/auth/permissionCheck';
	import { PermissionAction } from '@src/auth/permissionTypes';

	// Define permissions for different contexts
	const modaleEditFormConfig: PermissionConfig = {
		contextId: '/user/modaleEditForm',
		name: 'admin',
		action: PermissionAction.READ,
		contextType: 'user'
	};

	const isFirstUser = $page.data.isFirstUser;

	interface Props {
		/** Exposes parent props to this component. */
		parent: any;
		isGivenData?: boolean;
		username?: string | null;
		email?: string | null;
		role?: string | null;
		user_id?: string | null;
	}

	let { parent, isGivenData = false, username = null, email = null, role = null, user_id = null }: Props = $props();

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

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
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

		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	let formElement: HTMLFormElement = $state();

	async function deleteUser() {
		const formData = new FormData(formElement);
		formData.append('id', user._id);

		const res = await axios.post('?/deleteUser', formData);

		if (res.status === 200) {
			await invalidateAll();
			modalStore.close();
		}
	}
</script>

<!-- @component This example creates a simple form modal. -->
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
				<iconify-icon icon="mdi:user-circle" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
				<FloatingInput
					type="text"
					name="username"
					label={m.form_username()}
					bind:value={formData.username}
					on:keydown={() => (errorStatus.username.status = false)}
					required
					disabled={isGivenData && user_id != user?._id}
				/>
				{#if !errorStatus.username.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.username.msg}
					</div>
				{/if}
			</div>

			<!-- admin area -->
			{#if isGivenData ? role : user?.role === 'admin'}
				<!-- Email field -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
					<FloatingInput
						type="email"
						name="email"
						label={m.form_emailaddress()}
						bind:value={formData.email}
						on:keydown={() => (errorStatus.email.status = false)}
						required
						disabled
					/>
					{#if errorStatus.email.status}
						<div class="absolute left-0 top-11 text-xs text-error-500">
							{errorStatus.email.msg}
						</div>
					{/if}
				</div>
			{:else}
				<!-- only show email but normal user cant change it -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
					<FloatingInput
						type="email"
						name="email"
						label="Email Cannot be changed"
						bind:value={formData.email}
						on:keydown={() => (errorStatus.email.status = false)}
						icon="mdi:email"
						iconColor="white"
						textColor="white"
					/>
					{#if errorStatus.email.status}
						<div class="absolute left-0 top-11 text-xs text-error-500">
							{errorStatus.email.msg}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Password Change Section - Available for own profile -->
			{#if isOwnProfile}
				<!-- Password field -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>
					{#if showPassword}
						<FloatingInput
							type="text"
							name="password"
							id="password"
							label={m.modaleditform_newpassword()}
							bind:value={formData.password}
							on:keydown={() => (errorStatus.password.status = false)}
							autocomplete="new-password"
						/>
					{:else}
						<FloatingInput
							type="password"
							name="password"
							label={m.modaleditform_newpassword()}
							autocomplete="new-password"
							id="password"
							bind:value={formData.password}
							on:keydown={() => (errorStatus.password.status = false)}
						/>
					{/if}

					<button type="button" class="absolute right-2 top-2" onclick={() => (showPassword = !showPassword)}>
						{#if showPassword}
							<iconify-icon icon="bi:eye-fill" color="base" width="24"></iconify-icon>
						{:else}
							<iconify-icon icon="bi:eye-slash-fill" class="text-surface-500" width="24"></iconify-icon>
						{/if}
					</button>

					{#if errorStatus.password.status}
						<div class="absolute left-0 top-11 text-xs text-error-500">
							{errorStatus.password.msg}
						</div>
					{/if}
				</div>

				<!-- Password Confirm -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400"></iconify-icon>

					{#if showPassword}
						<FloatingInput
							type="text"
							name="confirm_password"
							id="confirm_password"
							label={m.form_confirmpassword()}
							bind:value={formData.confirmPassword}
							on:keydown={() => (errorStatus.confirm.status = false)}
							autocomplete="new-password"
						/>
					{:else}
						<FloatingInput
							type="password"
							name="confirm_password"
							id="confirm_password"
							label={m.form_confirmpassword()}
							bind:value={formData.confirmPassword}
							on:keydown={() => (errorStatus.confirm.status = false)}
							autocomplete="new-password"
						/>
					{/if}

					<button type="button" class="absolute right-2 top-2" onclick={() => (showPassword = !showPassword)}>
						{#if showPassword}
							<iconify-icon icon="bi:eye-fill" color="base" width="24"></iconify-icon>
						{:else}
							<iconify-icon icon="bi:eye-slash-fill" class="text-surface-500" width="24"></iconify-icon>
						{/if}
					</button>

					{#if errorStatus.confirm.status}
						<div class="absolute left-0 top-11 text-xs text-error-500">
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
										class="chip {isRoleActive(role._id) ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
										onclick={() => {
											formData.role = role._id;
											console.log('Selected Role:', formData.role);
										}}
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

			<footer class="modal-footer {parent.regionFooter} justify-between">
				<!-- Delete User -->
				{#if isFirstUser}
					<button
						type="button"
						onclick={deleteUser}
						class="variant-filled-error btn"
						disabled={!isFirstUser && (!isGivenData || user._id == user_id)}
					>
						<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon><span class="hidden sm:block">{m.button_delete()}</span>
					</button>
				{:else}
					<div></div>
					<!-- Empty div when isFirstUser -->
				{/if}

				<div class="flex justify-between gap-4">
					<!-- Cancel -->
					<button type="button" class="variant-outline-secondary btn" onclick={() => parent.onClose()}>{m.button_cancel()}</button>
					<!-- Save -->
					<button type="submit" class="variant-filled-tertiary btn btn dark:variant-filled-primary {parent.buttonPositive}" onclick={onFormSubmit}
						>{m.button_save()}</button
					>
				</div>
			</footer>
		</form>
	</div>
{/if}
