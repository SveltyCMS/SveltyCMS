<script lang="ts">
	import { page } from '$app/stores';
	import { roles } from '@src/collections/types';
	// define default role
	let roleSelected = Object.values(roles)[0];

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores

	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// Lucia
	const user = $page.data.user;

	// Form Data
	const formData = {
		username: user?.username,
		email: user?.email,
		password: '',
		confirmPassword: '',
		role: user?.role
	};

	let showPassword = false;

	let errorStatus = {
		username: { status: false, msg: '' },
		email: { status: false, msg: '' },
		password: { status: false, msg: '' },
		confirm: { status: false, msg: '' }
	};

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<header class={`text-center dark:text-primary-500 ${cHeader}`}>
		{$modalStore[0]?.title ?? '(title missing)'}
	</header>
	<article class="text-center text-sm">
		{$modalStore[0]?.body ?? '(body missing)'}
	</article>
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}">
		<!-- Username field -->
		<div class="group relative z-0 mb-6 w-full">
			<iconify-icon
				icon="mdi:user-circle"
				width="18"
				class="absolute left-0 top-3.5 text-gray-400"
			/>
			<input
				bind:value={formData.username}
				on:keydown={() => (errorStatus.username.status = false)}
				color={errorStatus.username.status ? 'red' : 'base'}
				type="text"
				name="username"
				class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
				placeholder=" "
				required
			/>
			<label
				for="username"
				class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
			>
				{$LL.LOGIN_Username()}<span class="ml-2 text-error-500">*</span>
			</label>

			{#if errorStatus.username.status}
				<div class="absolute left-0 top-11 text-xs text-error-500">
					{errorStatus.username.msg}
				</div>
			{/if}
		</div>

		<!-- admin area -->
		{#if user?.role == roles.admin}
			<!-- Email field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400" />
				<input
					bind:value={formData.email}
					on:keydown={() => (errorStatus.email.status = false)}
					color={errorStatus.email.status ? 'red' : 'base'}
					type="email"
					name="email"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>
				<label
					for="email"
					class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
				>
					{$LL.LOGIN_EmailAddress()}<span class="ml-2 text-error-500">*</span>
				</label>
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
				<input
					bind:value={formData.email}
					on:keydown={() => (errorStatus.email.status = false)}
					color={errorStatus.email.status ? 'red' : 'base'}
					type="email"
					name="email "
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					disabled
				/>
				<label
					for="email"
					class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-red-400 peer-focus:dark:text-tertiary-500"
				>
					Email Cannot be changed<span class="ml-2 text-error-500">*</span>
				</label>
				{#if errorStatus.email.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.email.msg}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Password field -->
		<div class="group relative z-0 mb-6 w-full">
			<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400" />
			{#if showPassword}
				<input
					bind:value={formData.password}
					on:keydown={() => (errorStatus.password.status = false)}
					color={errorStatus.password.status ? 'red' : 'base'}
					type="text"
					name="password"
					autocomplete="current-password"
					id="password"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>{:else}
				<input
					bind:value={formData.password}
					on:keydown={() => (errorStatus.password.status = false)}
					color={errorStatus.password.status ? 'red' : 'base'}
					type="password"
					name="password"
					autocomplete="current-password"
					id="password"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>{/if}
			<label
				for="password"
				class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
				>{$LL.USER_NewPassword()}<span class="ml-2 text-error-500">*</span></label
			>

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
				<input
					bind:value={formData.confirmPassword}
					on:keydown={() => (errorStatus.confirm.status = false)}
					color={errorStatus.confirm.status ? 'red' : 'base'}
					type="text"
					name="confirm_password"
					id="confirm_password"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/><label
					for="confirm_password"
					class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
					>{$LL.LOGIN_ConfirmPassword()}<span class="ml-2 text-error-500">*</span></label
				>
			{:else}
				<input
					bind:value={formData.confirmPassword}
					on:keydown={() => (errorStatus.confirm.status = false)}
					color={errorStatus.confirm.status ? 'red' : 'base'}
					type="password"
					name="confirm_password"
					id="confirm_password"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>
				<label
					for="confirm_password"
					class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
					>{$LL.LOGIN_ConfirmPassword()}<span class="ml-2 text-error-500">*</span></label
				>{/if}

			<!-- svelte-ignore a11y-click-events-have-key-events -->
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

		<!-- admin area -->
		{#if user?.role == roles.admin}
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="sm:w-1/4">Role:</div>
				<div class="flex-auto">
					<!-- TODO:  bind:value={formData.role}  -->

					<div class="flex flex-wrap gap-2 space-x-2">
						{#each Object.values(roles) as r}
							<span
								class="chip {roleSelected === r
									? 'variant-filled-tertiary'
									: 'variant-ghost-secondary'}"
								on:click={() => {
									// filterRole(r);
									roleSelected = r;
								}}
								on:keypress
								role="button"
								tabindex="0"
							>
								{#if roleSelected === r}<span><iconify-icon icon="fa:check" /></span>{/if}
								<span class="capitalize">{r}</span>
							</span>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</form>
	<!-- prettier-ignore -->
	<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Save</button>
    </footer>
</div>
