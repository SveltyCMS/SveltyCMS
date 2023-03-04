<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores
	import { modalStore } from '@skeletonlabs/skeleton';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	// Form Data
	const formData = {
		username: $user?.username,
		email: $user?.email,
		password: '',
		confirmPassword: '',
		role: $user?.role
	};

	let showPassword = false;

	// zod
	import z from 'zod';
	// const UserSchema = z
	// 	.object({
	// 		username: z
	// 			.string({ required_error: 'Username is required' })
	// 			.regex(/^[a-zA-z\s]*$/, { message: 'Name can only contain letters and spaces.' })
	// 			.min(2, { message: 'Name must be at least 2 charactes' })
	// 			.max(24, { message: 'Name can only be 24 charactes' })
	// 			.trim(),
	// 		email: z
	// 			.string({ required_error: 'Email is required' })
	// 			.email({ message: 'Email must be a valid email' }),
	// 		password: z
	// 			.string({ required_error: 'Password is required' })
	// 			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
	// 				message:
	// 					'Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character.'
	// 			}),
	// 		confirmPassword: z
	// 			.string({ required_error: 'Confirm Password is required' })
	// 			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
	// 				message:
	// 					'Confirm Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character.'
	// 			})
	// 	})
	// 	.superRefine(({ confirmPassword, password }, ctx) => {
	// 		if (confirmPassword !== password) {
	// 			ctx.addIssue({
	// 				code: z.ZodIssueCode.custom,
	// 				message: 'Password & Confirm password must match',
	// 				path: ['password']
	// 			});
	// 			ctx.addIssue({
	// 				code: z.ZodIssueCode.custom,
	// 				message: 'Password & Confirm password must match',
	// 				path: ['confirmPassword']
	// 			});
	// 		}
	// 	});
	// }

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

	//TODO: Get Roles from allowed user
	let roles: Record<string, boolean> = {
		Admin: true,
		Editor: false,
		User: false,
		Guest: false
	};

	function filter(role: string): void {
		for (const r in roles) {
			if (r !== role) {
				roles[r] = false;
			}
		}
		roles[role] = !roles[role];
	}
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<header class={cHeader}>{$modalStore[0]?.title ?? '(title missing)'}</header>
	<article>{$modalStore[0]?.body ?? '(body missing)'}</article>
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}">
		<!-- Username field -->
		<div class="group relative z-0 mb-6 w-full">
			<Icon icon="mdi:user-circle" width="18" class="absolute top-3.5 left-0 text-gray-400" />
			<input
				bind:value={formData.username}
				on:keydown={() => (errorStatus.username.status = false)}
				color={errorStatus.username.status ? 'red' : 'base'}
				type="text"
				name="username"
				class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
				placeholder=" "
				required
			/>
			<label
				for="username"
				class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
			>
				{$LL.LOGIN_Username()}<span class="ml-2 text-error-500">*</span>
			</label>

			{#if errorStatus.username.status}
				<div class="absolute top-11 left-0 text-xs text-error-500">
					{errorStatus.username.msg}
				</div>
			{/if}
		</div>

		<!-- Email field -->
		<div class="group relative z-0 mb-6 w-full">
			<Icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-400" />
			<input
				bind:value={formData.email}
				on:keydown={() => (errorStatus.email.status = false)}
				color={errorStatus.email.status ? 'red' : 'base'}
				type="email"
				name="email"
				class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
				placeholder=" "
				required
			/>
			<label
				for="email"
				class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
			>
				{$LL.LOGIN_EmailAddress()}<span class="ml-2 text-error-500">*</span>
			</label>
			{#if errorStatus.email.status}
				<div class="absolute top-11 left-0 text-xs text-error-500">
					{errorStatus.email.msg}
				</div>
			{/if}
		</div>

		<!-- Password field -->
		<div class="group relative z-0 mb-6 w-full">
			<Icon icon="mdi:password" width="18" class="absolute top-3.5 left-0 text-gray-400" />
			{#if showPassword}
				<input
					bind:value={formData.password}
					on:keydown={() => (errorStatus.password.status = false)}
					color={errorStatus.password.status ? 'red' : 'base'}
					type="text"
					name="password"
					autocomplete="current-password"
					id="password"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
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
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>{/if}
			<label
				for="password"
				class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
				>{$LL.LOGIN_Password()}<span class="ml-2 text-error-500">*</span></label
			>

			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div class="absolute top-2 right-2" on:click={() => (showPassword = !showPassword)}>
				{#if showPassword}
					<Icon icon="bi:eye-fill" color="base" width="24" />
				{:else}
					<Icon icon="bi:eye-slash-fill" class="text-surface-500" width="24" />
				{/if}
			</div>

			{#if errorStatus.password.status}
				<div class="absolute top-11 left-0 text-xs text-error-500">
					{errorStatus.password.msg}
				</div>
			{/if}
		</div>

		<!-- Password Confirm -->
		<div class="group relative z-0 mb-6 w-full">
			<Icon icon="mdi:password" width="18" class="absolute top-3.5 left-0 text-gray-400" />

			{#if showPassword}
				<input
					bind:value={formData.confirmPassword}
					on:keydown={() => (errorStatus.confirm.status = false)}
					color={errorStatus.confirm.status ? 'red' : 'base'}
					type="text"
					name="confirm_password"
					id="confirm_password"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/><label
					for="confirm_password"
					class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
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
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>
				<label
					for="confirm_password"
					class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
					>{$LL.LOGIN_ConfirmPassword()}<span class="ml-2 text-error-500">*</span></label
				>{/if}

			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div class="absolute top-2 right-2" on:click={() => (showPassword = !showPassword)}>
				{#if showPassword}
					<Icon icon="bi:eye-fill" color="base" width="24" />
				{:else}
					<Icon icon="bi:eye-slash-fill" class="text-surface-500" width="24" />
				{/if}
			</div>

			{#if errorStatus.confirm.status}
				<div class="absolute top-11 left-0 text-xs text-error-500">
					{errorStatus.confirm.msg}
				</div>
			{/if}
		</div>

		<!-- admin area -->
		{#if $user?.role === 'ADMIN'}
			<div class="flex flex-col sm:flex-row gap-2">
				<div class="sm:w-1/4">Role:</div>
				<div class="flex-auto">
					<!-- TODO:  bind:value={formData.role}  -->

					<div class="flex flex-wrap gap-2 space-x-2">
						{#each Object.keys(roles) as r}
							<span
								class="chip {roles[r] ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
								on:click={() => {
									filter(r);
								}}
								on:keypress
							>
								{#if roles[r]}<span><Icon icon="fa:check" /></span>{/if}
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
