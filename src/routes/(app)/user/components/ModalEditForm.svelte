<script lang="ts">
	import axios from 'axios';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';

	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Auth
	import { roles, type User } from '@src/auth/types';
	const user: User = $page.data.user;
	console.log('User:', user);

	const isFirstUser = $page.data.isFirstUser;

	export let isGivenData: boolean = false;
	export let username: string | null = null;
	export let email: string | null = null;
	export let role: string | null = null;
	export let user_id: string | null = null;

	// Form Data
	const formData = {
		user_id: isGivenData ? user_id : user?.user_id,
		username: isGivenData ? username : user?.username,
		email: isGivenData ? email : user?.email,
		password: '',
		confirmPassword: '',
		role: isGivenData ? role : user?.role
	};

	let showPassword = false;

	const errorStatus = {
		username: { status: false, msg: '' },
		email: { status: false, msg: '' },
		password: { status: false, msg: '' },
		confirm: { status: false, msg: '' }
	};

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		// console.log('modal submitted.');
		if ($modalStore[0].response) $modalStore[0].response(formData);

		if ((isGivenData && user_id != user?.user_id) || (formData.password !== null && formData.password === formData.confirmPassword)) {
			modalStore.close();
		} else {
			console.log('error');
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	let formElement: HTMLFormElement;

	async function deleteUser() {
		const formData = new FormData(formElement); // create a FormData object from the formElement
		formData.append('id', user.user_id); // add the id property to the FormData object

		const res = await axios.post('?/deleteUser', formData);

		if (res.status === 200) {
			await invalidateAll();
			modalStore.close(); // Close modal after successful deletion
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
		<!-- Enable for debugging: -->
		<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
		<form class="modal-form {cForm}" bind:this={formElement} id="change_user_form">
			<!-- Username field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:user-circle" width="18" class="absolute left-0 top-3.5 text-gray-400" />
				<FloatingInput
					type="text"
					name="username"
					label={m.form_username()}
					bind:value={formData.username}
					on:keydown={() => (errorStatus.username.status = false)}
					required
					disabled={isGivenData && user_id != user?.user_id}
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
					<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400" />
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
					<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400" />
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
			{#if (user.user_id == user_id || !isGivenData) && user?.lastAuthMethod == 'token'}
				<!-- Password field -->
				<div class="group relative z-0 mb-6 w-full">
					<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400" />
					{#if showPassword}
						<FloatingInput
							type="text"
							name="password"
							id="password"
							label={m.modaleditform_newpassword()}
							bind:value={formData.password}
							on:keydown={() => (errorStatus.password.status = false)}
							autocomplete="current-password"
							required
						/>{:else}
						<FloatingInput
							type="password"
							name="password"
							label={m.modaleditform_newpassword()}
							autocomplete="current-password"
							id="password"
							bind:value={formData.password}
							on:keydown={() => (errorStatus.password.status = false)}
							required
						/>{/if}

					<button class="absolute right-2 top-2" on:click={() => (showPassword = !showPassword)}>
						{#if showPassword}
							<iconify-icon icon="bi:eye-fill" color="base" width="24" />
						{:else}
							<iconify-icon icon="bi:eye-slash-fill" class="text-surface-500" width="24" />
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
					<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400" />

					{#if showPassword}
						<FloatingInput
							type="text"
							name="confirm_password"
							id="confirm_password"
							label={m.form_confirmpassword()}
							bind:value={formData.confirmPassword}
							on:keydown={() => (errorStatus.confirm.status = false)}
							required
						/>
					{:else}
						<FloatingInput
							type="password"
							name="confirm_password"
							id="confirm_password"
							label={m.form_confirmpassword()}
							bind:value={formData.confirmPassword}
							on:keydown={() => (errorStatus.confirm.status = false)}
							required
						/>
					{/if}

					<button class="absolute right-2 top-2" on:click={() => (showPassword = !showPassword)}>
						{#if showPassword}
							<iconify-icon icon="bi:eye-fill" color="base" width="24" />
						{:else}
							<iconify-icon icon="bi:eye-slash-fill" class="text-surface-500" width="24" />
						{/if}
					</button>

					{#if errorStatus.confirm.status}
						<div class="absolute left-0 top-11 text-xs text-error-500">
							{errorStatus.confirm.msg}
						</div>
					{/if}
				</div>
			{/if}

			<!-- admin area -->
			<!-- TODO:  Self or last first user cannot change role -->
			{#if user.role === 'admin'}
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.form_userrole()}</div>
					<div class="flex-auto">
						<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
							{#each Object.values(roles) as r}
								<span
									class="chip {formData.role === r ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
									on:click={() => {
										// filterRole(r);
										formData.role = r;
									}}
									on:keypress
									role="button"
									tabindex="0"
								>
									{#if formData.role === r}<span><iconify-icon icon="fa:check" /></span>{/if}
									<span class="capitalize">{r}</span>
								</span>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</form>

		<footer class="modal-footer {parent.regionFooter} justify-between">
			{#if isFirstUser}
				<button
					type="button"
					on:click={deleteUser}
					class="variant-filled-error btn"
					disabled={!isFirstUser && (!isGivenData || user.user_id == user_id)}
				>
					<iconify-icon icon="icomoon-free:bin" width="24" /><span class="hidden sm:block">{m.button_delete()}</span>
				</button>
			{:else}
				<div></div>
				<!-- Empty div when isFirstUser -->
			{/if}

			<div class="flex justify-between gap-2">
				<button class="variant-outline-secondary btn" on:click={() => parent.onClose()}>{m.button_cancel()}</button>
				<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.button_save()}</button>
			</div>
		</footer>
	</div>
{/if}
