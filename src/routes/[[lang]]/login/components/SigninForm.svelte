<script lang="ts">
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import { enhance } from '$app/forms';

	import { PUBLIC_SITENAME } from '$env/static/public';
	import CMSLogo from './icons/Logo.svelte';

	// TODO: forgotton not working
	import axios from 'axios';
	import { goto } from '$app/navigation';
	import z from 'zod';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import Loading from '$src/components/Loading.svelte';

	let isLoading = false;

	let isWiggling = false;

	// zod validation Forgotton Password
	const forgotPasswordSchema = z.object({
		forgottonemail: z
			.string({ required_error: 'Email is required' })
			.email({ message: 'Email must be a valid email' })
	});

	const sendResetMail = async () => {
		const validationResult = forgotPasswordSchema.safeParse({ forgottonemail });
		if (!validationResult.success) {
			isWiggling = true;
			errorStatus.forgottonemail.status = true;
			errorStatus.forgottonemail.msg = validationResult?.error?.errors[0].message;
			return;
		}

		isLoading = true;

		try {
			const { data } = await axios.post('/api/forgotPassword', { email });

			if (data.type === 'success') {
				// show success message
				const emailSubject = 'Password Forgotten Request';
				// const emailMessage = `Hi there,<br>
				// <br>We received a request to reset your password. Your password reset token is:<br>
				// <br>${data.token}<br>
				// <br>Please follow the link below to reset your password:<br>
				// <br>${resetUrl}<br>
				// <br>If you did not request this reset, please disregard this message.<br>
				// <br>Best regards,<br>The Support Team`;
			} else {
				// show error message
			}
		} catch (error) {
			// handle error
		} finally {
			isLoading = false;
		}
	};

	export let show = false;
	export let forgot = false;
	export let resetPW = false;

	let showPassword = false;

	export let email = '';
	export let password = '';

	let forgottonemail = '';
	let confirmPassword = '';
	let token = ''; // token send by admin

	let errorStatus: Record<string, { status: boolean; msg: string }> = {
		email: { status: false, msg: '' },
		confirm: { status: false, msg: '' },
		password: { status: false, msg: '' },
		confirm_password: { status: false, msg: '' },
		forgottonemail: { status: false, msg: '' },
		token: { status: false, msg: '' }
	};

	let form: HTMLDivElement;

	let oldErrorStatus = errorStatus;
	const resetErrorObject = (field_to_exclude: string) => {
		errorStatus = {
			email: { status: false, msg: '' },
			confirm: { status: false, msg: '' },
			password: { status: false, msg: '' },
			forgottonemail: { status: false, msg: '' }
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
	const zod_obj: Record<string, z.ZodString> = {
		email: z
			.string({ required_error: get(LL).LOGIN_ZOD_Email_string() })
			.email({ message: get(LL).LOGIN_ZOD_Email_email() }),
		password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Password_regex()
			})
	};

	const zodValidate = (obj_to_test: string, value: string) => {
		resetErrorObject(obj_to_test);
		const signInSchema = z.object({ obj_to_test: zod_obj[obj_to_test] });
		const validationResult = signInSchema.safeParse({ obj_to_test: value });
		if (!validationResult.success) {
			addWigglingToForm();

			validationResult.error.errors.forEach((error) => {
				errorStatus[obj_to_test].status = true;
				errorStatus[obj_to_test].msg = error.message;
			});
		}
	};

	const addWigglingToForm = () => {
		isWiggling = true;
		// to remove wiggling class
		setTimeout(() => {
			isWiggling = false;
		}, 300);
	};

	// show the reset password screen
	if ($page.url.searchParams.get('token')) {
		resetPW = true;
		token = $page.url.searchParams.get('token') as string;
	}
</script>

<div class:hide={!show} class="w-full opacity-100 duration-[2000ms]">
	{#if !forgot && !resetPW}
		<div bind:this={form} class="mx-auto mt-[15%] mb-[5%] w-full p-4 lg:w-1/2">
			<div class="mb-8 flex flex-row gap-2">
				<CMSLogo className="w-14" fill="red" />
				<h1 class="text-2xl font-bold text-black lg:text-3xl">
					<div class="text-xs text-surface-300">{PUBLIC_SITENAME}</div>
					<div class="-mt-1">{$LL.LOGIN_SignIn()}</div>
				</h1>
			</div>

			<div class="-mt-2 mb-2 text-xs text-right text-error-500">{$LL.LOGIN_Required()}</div>

			<form
				class="form {isWiggling && 'wiggle'}"
				method="post"
				action="?/authUser"
				use:enhance={(e) => {
					isLoading = true;
					return async ({ result }) => {
						if (result.type === 'success') {
							goto('/');
						}

						if (result.type === 'failure') {
							addWigglingToForm();
							isWiggling = true;
							result?.data?.errors &&
								result?.data?.errors.forEach((error) => {
									errorStatus[error.field].status = true;
									errorStatus[error.field].msg = error.message;
								});
						}
						isLoading = false;
					};
				}}
			>
				{#if !isLoading}
					<!-- Email field -->
					<div class="group relative z-0 mb-6 w-full">
						<Icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-500" />
						<input
							bind:value={email}
							on:keydown={() => (errorStatus.email.status = false)}
							color={errorStatus.email.status ? 'red' : 'base'}
							type="email"
							name="email"
							class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
							placeholder=" "
							required
							on:blur={() => zodValidate('email', email)}
						/>
						<label
							for="email"
							class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
							>{$LL.LOGIN_EmailAddress()}<span class="ml-2 text-error-500">*</span></label
						>
						{#if errorStatus.email.status}
							<div class="absolute top-11 left-0 text-xs text-error-500">
								{errorStatus.email.msg}
							</div>
						{/if}
					</div>

					<!-- Password field -->
					<div class="group relative z-0 mb-6 w-full">
						<Icon icon="mdi:password" width="18" class="absolute top-3.5 left-0 text-gray-500" />
						{#if showPassword}
							<input
								bind:value={password}
								on:keydown={() => (errorStatus.password.status = false)}
								color={errorStatus.password.status ? 'red' : 'base'}
								type="text"
								name="password"
								autocomplete="current-password"
								id="password"
								class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
								placeholder=" "
								required
								on:blur={() => zodValidate('password', password)}
							/>
						{:else}
							<input
								bind:value={password}
								on:keydown={() => (errorStatus.password.status = false)}
								color={errorStatus.password.status ? 'red' : 'base'}
								type="password"
								name="password"
								autocomplete="current-password"
								id="password"
								class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
								placeholder=" "
								required
								on:blur={() => zodValidate('password', password)}
							/>
						{/if}
						<label
							for="password"
							class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
							>{$LL.LOGIN_Password()}<span class="ml-2 text-error-500">*</span></label
						>

						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<div class="absolute top-2 right-2" on:click={() => (showPassword = !showPassword)}>
							{#if showPassword}
								<Icon icon="bi:eye-fill" class="text-surface-500" width="24" />
							{:else}
								<Icon icon="bi:eye-slash-fill" class="text-gray-500" width="24" />
							{/if}
						</div>

						{#if errorStatus.password.status}
							<div class="absolute top-11 left-0 text-xs text-error-500">
								{errorStatus.password.msg}
							</div>
						{/if}
					</div>
					<div class="buttons">
						<button class="btn btn-sm mt-4 rounded-lg border bg-surface-700 text-white "
							>{$LL.LOGIN_SignIn()}</button
						>

						<button
							on:click={() => (forgot = true)}
							class="btn btn-sm mt-4 ml-4 rounded-lg border border-surface-700 text-surface-700 "
							>{$LL.LOGIN_ForgottenPassword()}</button
						>
					</div>
				{:else}
					<Loading />
				{/if}
			</form>
		</div>
	{:else if resetPW && !forgot}
		<!-- Reset Password -->
		<form
			class="form {isWiggling && 'wiggle'} mx-auto w-full p-4 lg:w-1/2"
			method="post"
			action="?/resetPassword"
			use:enhance={(e) => {
				isLoading = true;
				return async ({ result }) => {
					if (result.type === 'success') {
						resetPW = false; // switch back to the signup page by changing the forgot variable
						goto('/login');
					}

					if (result.type === 'failure') {
						isWiggling = true;
						result?.data?.errors &&
							result?.data?.errors.forEach((error) => {
								errorStatus[error.field].status = true;
								errorStatus[error.field].msg = error.message;
							});
					}
					isLoading = false;
				};
			}}
		>
			<div class="mb-8 flex flex-row items-start gap-2">
				<CMSLogo className="w-[3rem]" fill="red" />

				<h1 class="font-bold text-black">
					<div class="text-xs text-surface-300">{PUBLIC_SITENAME}</div>
					<div class="-mt-1 text-2xl sm:text-4xl">{$LL.LOGIN_ResetPassword()}</div>
				</h1>
			</div>
			<div class="-mt-2 mb-2 text-xs text-right text-error-500">{$LL.LOGIN_Required()}</div>

			{#if !isLoading}
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
							class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
							placeholder=" "
						/>{:else}
						<input
							bind:value={password}
							on:keydown={() => (errorStatus.password.status = false)}
							color={errorStatus.password.status ? 'red' : 'base'}
							type="password"
							name="password"
							autocomplete="current-password"
							id="password"
							class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
							placeholder=" "
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
							class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
							placeholder=" "
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
							class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
							placeholder=" "
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
				<div class="group relative z-0 mb-6 w-full">
					<Icon icon="mdi:key-chain" width="18" class="absolute top-3.5 left-0 text-gray-400" />
					<input
						bind:value={token}
						on:keydown={() => (errorStatus.token.status = false)}
						color={errorStatus.token.status ? 'red' : 'base'}
						type="text"
						name="token"
						id="token"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
						placeholder=" "
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

				<div class="flex gap-4 items-center mt-4">
					<button type="submit" class="btn btn-sm rounded-lg border bg-surface-600 text-white"
						>{$LL.LOGIN_ResetPasswordSave()}</button
					>
					<button
						on:click={() => {
							resetPW = false;
							forgot = false;
						}}
						class="btn btn-sm text-surface-600 "
						><Icon icon="mdi:arrow-left-circle" width="36" /></button
					>
				</div>
			{:else}
				<Loading />
			{/if}
		</form>
	{:else}
		<!-- Forgotton Password -->
		<form
			class="form {isWiggling && 'wiggle'} mx-auto w-full p-4 lg:w-1/2"
			method="post"
			action="?/forgotPassword"
			use:enhance={(e) => {
				isLoading = true;
				return async ({ result }) => {
					if (result.type === 'success') {
						forgot = false; // reset forgotton variable
						resetPW = true; // goto rest Password page
						goto('/login');
					}

					if (result.type === 'failure') {
						isWiggling = true;
						result?.data?.errors &&
							result?.data?.errors.forEach((error) => {
								errorStatus[error.field].status = true;
								errorStatus[error.field].msg = error.message;
							});
					}
					isLoading = false;
				};
			}}
		>
			<div class="mb-8 flex flex-row items-start gap-2">
				<CMSLogo className="w-[3rem]" fill="red" />

				<h1 class="font-bold text-black">
					<div class="text-xs text-surface-300">{PUBLIC_SITENAME}</div>
					<div class="-mt-1 text-2xl sm:text-4xl">{$LL.LOGIN_ForgottenPassword()}</div>
				</h1>
			</div>
			<div class="-mt-2 mb-2 text-xs text-right text-error-500">{$LL.LOGIN_Required()}</div>

			{#if !isLoading}
				<!-- Email field -->
				<div class="group relative z-0 mb-6 w-full">
					<Icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-500" />

					<input
						bind:value={forgottonemail}
						on:keydown={() => (errorStatus.forgottonemail.status = false)}
						color={errorStatus.forgottonemail.status ? 'red' : 'base'}
						type="email"
						name="forgottonemail"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
						placeholder=" "
						required
					/>
					<label
						for="forgottonemail"
						class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
						>{$LL.LOGIN_EmailAddress()}<span class="ml-2 text-error-500">*</span></label
					>

					{#if errorStatus.forgottonemail.status}
						<div class="absolute top-11 left-0 text-xs text-error-500">
							{errorStatus.forgottonemail.msg}
						</div>
					{/if}
				</div>

				<div class="flex gap-4 items-center mt-4">
					<button type="submit" class="btn btn-sm rounded-lg border bg-surface-600 text-white"
						>{$LL.LOGIN_SendResetMail()}</button
					>
					<button
						on:click={() => {
							forgot = false;
							resetPW = false;
						}}
						class="btn btn-sm text-surface-600 "
						><Icon icon="mdi:arrow-left-circle" width="36" /></button
					>
				</div>
			{:else}
				<Loading />
			{/if}
		</form>
	{/if}
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
