<script lang="ts">
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import { enhance } from '$app/forms';

	import { PUBLIC_SITENAME } from '$env/static/public';
	import CMSLogo from './icons/Logo.svelte';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { z } from 'zod';

	export let show = false;
	let showPassword = false;

	export let firstUserExists = false;
	let username = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let token = ''; // token send by admin
	let terms = ''; // terms and conditions

	let errorStatus: Record<string, { status: boolean; msg: string }> = {
		general: { status: false, msg: '' },
		username: { status: false, msg: '' },
		email: { status: false, msg: '' },
		password: { status: false, msg: '' },
		confirm_password: { status: false, msg: '' },
		token: { status: false, msg: '' },
		terms: { status: false, msg: '' }
	};

	const zod_obj: Record<string, z.ZodString> = {
		username: z
			.string({ required_error: get(LL).LOGIN_ZOD_Username_string() })
			.regex(/^[a-zA-Z0-9@$!%*#]+$/, { message: get(LL).LOGIN_ZOD_Username_regex() })
			.min(2, { message: get(LL).LOGIN_ZOD_Username_min() })
			.max(24, { message: get(LL).LOGIN_ZOD_Username_max() })
			.trim(),
		email: z
			.string({ required_error: get(LL).LOGIN_ZOD_Email_string() })
			.email({ message: get(LL).LOGIN_ZOD_Email_email() }),
		password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Password_regex()
			}),
		confirm_password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Confirm_password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Confirm_password_regex()
			}),
		token: z.string({ required_error: get(LL).LOGIN_ZOD_Token_string() }).min(1)
		// terms: z.boolean({ required_error: 'Confirm Terms' })
	};

	// remove token validation if user is not a first time user
	if (!firstUserExists) {
		delete zod_obj.token;
	}

	let oldErrorStatus = errorStatus;
	const resetErrorObject = (field_to_exclude: string) => {
		errorStatus = {
			general: { status: false, msg: '' },
			username: { status: false, msg: '' },
			email: { status: false, msg: '' },
			password: { status: false, msg: '' },
			confirm_password: { status: false, msg: '' },
			token: { status: false, msg: '' },
			terms: { status: false, msg: '' }
		};

		Object.keys(errorStatus).forEach((key) => {
			if (oldErrorStatus[key].status) {
				errorStatus[key] = oldErrorStatus[key];
			}

			if (key === field_to_exclude) {
				errorStatus[key] = oldErrorStatus[key];
			}
		});

		oldErrorStatus = errorStatus;
	};

	const zodValidate = (obj_to_test: string, value: string) => {
		resetErrorObject(obj_to_test);
		if (obj_to_test === 'confirm_password') {
			// confirm password without zod
			if (confirmPassword !== password) {
				addWigglingToForm();
				errorStatus[obj_to_test].status = true;
				errorStatus[obj_to_test].msg = get(LL).LOGIN_ZOD_Password_match();
			}
			return;
		}
		const signupSchema = z.object({ obj_to_test: zod_obj[obj_to_test] });
		const validationResult = signupSchema.safeParse({ obj_to_test: value });
		if (!validationResult.success) {
			addWigglingToForm();
			validationResult.error.errors.forEach((error) => {
				errorStatus[obj_to_test].status = true;
				errorStatus[obj_to_test].msg = error.message;
			});
		}
	};

	let isWiggling = false;
	const addWigglingToForm = () => {
		isWiggling = true;
		// to remove wiggling class
		setTimeout(() => {
			isWiggling = false;
		}, 300);
	};
</script>

<div class:hide={!show} class="w-full opacity-100 duration-[2000ms]">
	<div class="mx-auto mt-[15%] mb-[5%] w-full  p-4 lg:w-1/2">
		<div class="mb-8 flex flex-row gap-2">
			<CMSLogo className="w-14" fill="red" />

			<h1 class="text-2xl font-bold text-white lg:text-3xl">
				<div class="text-xs text-surface-300">{PUBLIC_SITENAME}</div>
				<div class="-mt-1">{$LL.LOGIN_SignUp()}</div>
			</h1>
		</div>
		<div class="-mt-2 mb-2 text-xs text-right text-error-500">{$LL.LOGIN_Required()}</div>

		<form
			class="form {isWiggling && 'wiggle'}"
			method="post"
			action="?/createUser"
			use:enhance={(e) => {
				return async ({ result }) => {
					if (result.type === 'success') {
						goto('/');
					}

					if (result.type === 'failure') {
						addWigglingToForm();
						result?.data?.errors &&
							// @ts-ignore
							result?.data?.errors.forEach((error) => {
								errorStatus[error.field].status = true;
								errorStatus[error.field].msg = error.message;
							});
					}
				};
			}}
		>
			{#if errorStatus.general.status}
				<div class="text-xs text-error-500">
					{errorStatus.general.msg}
				</div>
			{/if}
			<!-- Username field -->
			<div class="group relative z-0 mb-6 w-full">
				<Icon icon="mdi:user-circle" width="18" class="absolute top-3.5 left-0 text-gray-400" />
				<input
					bind:value={username}
					on:keydown={() => (errorStatus.username.status = false)}
					color={errorStatus.username.status ? 'red' : 'base'}
					type="text"
					name="username"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					on:blur={() => zodValidate('username', username)}
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
					bind:value={email}
					on:keydown={() => (errorStatus.email.status = false)}
					color={errorStatus.email.status ? 'red' : 'base'}
					type="text"
					name="email"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					on:blur={() => zodValidate('email', email)}
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
						bind:value={password}
						on:keydown={() => (errorStatus.password.status = false)}
						color={errorStatus.password.status ? 'red' : 'base'}
						type="text"
						name="password"
						autocomplete="current-password"
						id="password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						on:blur={() => zodValidate('password', password)}
					/>{:else}
					<input
						bind:value={password}
						on:keydown={() => (errorStatus.password.status = false)}
						color={errorStatus.password.status ? 'red' : 'base'}
						type="password"
						name="password"
						autocomplete="current-password"
						id="password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						on:blur={() => zodValidate('password', password)}
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
						bind:value={confirmPassword}
						on:keydown={() => (errorStatus.confirm_password.status = false)}
						color={errorStatus.confirm_password.status ? 'red' : 'base'}
						type="text"
						name="confirm_password"
						id="confirm_password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						on:blur={() => zodValidate('confirm_password', confirmPassword)}
					/><label
						for="confirm_password"
						class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
						>{$LL.LOGIN_ConfirmPassword()}<span class="ml-2 text-error-500">*</span></label
					>
				{:else}
					<input
						bind:value={confirmPassword}
						on:keydown={() => (errorStatus.confirm_password.status = false)}
						color={errorStatus.confirm_password.status ? 'red' : 'base'}
						type="password"
						name="confirm_password"
						id="confirm_password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						on:blur={() => zodValidate('confirm_password', confirmPassword)}
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

				{#if errorStatus.confirm_password.status}
					<div class="absolute top-11 left-0 text-xs text-error-500">
						{errorStatus.confirm_password.msg}
					</div>
				{/if}
			</div>
			<!-- Registration Token -->
			{#if firstUserExists}
				<div class="group relative z-0 mb-6 w-full">
					<Icon icon="mdi:key-chain" width="18" class="absolute top-3.5 left-0 text-gray-400" />
					<input
						bind:value={token}
						on:keydown={() => (errorStatus.token.status = false)}
						color={errorStatus.token.status ? 'red' : 'base'}
						type="text"
						name="token"
						id="token"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						on:blur={() => zodValidate('token', token)}
					/>
					<label
						for="token"
						class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
						>{$LL.LOGIN_Token()}<span class="ml-2 text-error-500">*</span></label
					>

					{#if errorStatus.token.status}
						<div class="absolute top-11 left-0 text-xs text-error-500">
							{errorStatus.token.msg}
						</div>
					{/if}
				</div>
			{/if}

			<!-- TODO: Add T&C with CHECK -->
			<div class="flex gap-5 items-center">
				<button class="btn btn-sm mt-4 rounded-md bg-white text-black">
					{$LL.LOGIN_SignUp()}
				</button>
				<!-- <div class="checkbox required mt-3 flex items-center space-x-2">
					<input type="checkbox" name="checkbox_TC" />
					<p>Confirm T&C</p>
					<span class="ml-2 text-error-500">*</span>
				</div> -->
			</div>
		</form>
	</div>
</div>

<style>
	.hide {
		transition: 0s;
		opacity: 0;
	}
	:global(.wiggle) {
		animation: wiggle 0.3s forwards;
	}
	@keyframes wiggle {
		0% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(150px);
		}
		50% {
			transform: translateX(-75px);
		}
		75% {
			transform: translateX(200px);
		}
		100% {
			transform: translateX(0px);
		}
	}
</style>
