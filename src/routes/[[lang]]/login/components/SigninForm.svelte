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
	let loading = false;
	const sendResetMail = async () => {
		if (!email) {
			errorStatus.email.status = true;
			errorStatus.email.msg = 'Email is required';
			return;
		} else if (!/\S+@\S+\.\S+/.test(email)) {
			errorStatus.email.status = true;
			errorStatus.email.msg = 'Invalid email format';
			return;
		}

		loading = true;

		try {
			const { data } = await axios.post('/api/forgotPassword', { email });

			if (data.type === 'success') {
				// show success message
			} else {
				// show error message
			}
		} catch (error) {
			// handle error
		} finally {
			loading = false;
		}
	};

	export let show = false;
	export let forgot = false;

	let showPassword = false;

	export let email = '';
	export let password = '';

	// zod
	// import z from 'zod';
	// const signInSchema = z
	// 	.object({
	// 		email: z
	// 			.string({ required_error: 'Email is required' })
	// 			.email({ message: 'Email must be a valid email' }),
	// 		password: z
	// 			.string({ required_error: 'Password is required' })
	// 			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
	// 				message:
	// 					'Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character.'
	// 			}),
	// 		});
	// }

	let errorStatus = {
		email: { status: false, msg: '' },
		confirm: { status: false, msg: '' },
		password: { status: false, msg: '' }
	};
	let form: HTMLDivElement;

	function hasSignInError() {
		email = email.trim();
		let emailRegex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
		let error = false;

		if (!emailRegex.test(email)) {
			errorStatus.email.status = true;
			errorStatus.email.msg = $LL.LOGIN_emailmsg_valid();
			error = true;
		}
		if (!/\.\w+$/.test(email)) {
			errorStatus.email.msg = $LL.LOGIN_emailmsg_domain();
		}
		if (!email.includes('@')) {
			errorStatus.email.msg = $LL.LOGIN_emailmsg_at();
		}
		if (!email) {
			errorStatus.email.msg = $LL.LOGIN_emailmsg_empty();
		}
		if (!password) {
			errorStatus.password.msg = $LL.LOGIN_passwordmsg_empty();
			errorStatus.password.status = true;
			error = true;
		}

		return error;
	}
</script>

<div class:hide={!show} class="w-full opacity-100 duration-[2000ms]">
	{#if !forgot}
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
				method="post"
				action="?/authUser"
				use:enhance={(e) => {
					if (hasSignInError()) {
						e.cancel();
					}
				}}
			>
				<!-- Email field -->
				<div class="group relative z-0 mb-6 w-full">
					<Icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-500" />
					<input
						bind:value={email}
						on:keydown={() => (errorStatus.email.status = false)}
						color={errorStatus.email.status ? 'red' : 'base'}
						type="email"
						name="floating_email"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-0 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
						placeholder=" "
						required
					/>
					<label
						for="floating_email"
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
				<!-- TODO  - not working error 'type' attribute cannot be dynamic if input uses two-way binding 
					type={showPassword ? 'text' : 'password'}
				-->
				<div class="group relative z-0 mb-6 w-full">
					<Icon icon="mdi:password" width="18" class="absolute top-3.5 left-0 text-gray-500" />
					{#if showPassword}
						<input
							bind:value={password}
							on:keydown={() => (errorStatus.password.status = false)}
							color={errorStatus.password.status ? 'red' : 'base'}
							type="text"
							name="floating_password"
							autocomplete="current-password"
							id="floating_password"
							class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-0 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
							placeholder=" "
							required
						/>
					{:else}
						<input
							bind:value={password}
							on:keydown={() => (errorStatus.password.status = false)}
							color={errorStatus.password.status ? 'red' : 'base'}
							type="password"
							name="floating_password"
							autocomplete="current-password"
							id="floating_password"
							class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-0 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
							placeholder=" "
							required
						/>
					{/if}
					<label
						for="floating_password"
						class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
						>{$LL.LOGIN_Password()}<span class="ml-2 text-error-500">*</span></label
					>

					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div class="absolute top-2 right-2" on:click={() => (showPassword = !showPassword)}>
						{#if showPassword}
							<Icon icon="bi:eye-fill" color="text-surface-500" width="24" />
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
			</form>
		</div>
	{:else}
		<!-- Forgotton Password -->
		<!-- <form class="mx-auto w-full p-4 lg:w-1/2" method="post" action="?/forgotPassword"> -->
		<form on:submit|preventDefault={sendResetMail} class="mx-auto w-full p-4 lg:w-1/2">
			<div class="mb-8 flex flex-row items-start gap-2">
				<CMSLogo className="w-[3rem]" fill="red" />

				<h1 class="text-2xl font-bold text-black lg:text-3xl">
					<div class="text-xs text-surface-300">{PUBLIC_SITENAME}</div>
					<div class="-mt-1 text-4xl">{$LL.LOGIN_ForgottenPassword()}</div>
				</h1>
			</div>
			<div class="-mt-2 mb-2 text-xs text-right text-error-500">{$LL.LOGIN_Required()}</div>

			<!-- Email field -->
			<!-- TODO Error messge not working as it need to be FORGOT EMAIL -->
			<div class="group relative mb-6 w-full">
				<Icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-500" />

				<input
					bind:value={email}
					on:keydown={() => (errorStatus.email.status = false)}
					color={errorStatus.email.status ? 'red' : 'base'}
					type="email"
					name="floating_forgottonemail"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-0 text-sm !text-surface-900 focus:border-surface-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-surface-500"
					placeholder=" "
					required
				/>
				<label
					for="floating_forgottonemail"
					class="absolute top-3 left-5 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
					>{$LL.LOGIN_EmailAddress()}<span class="ml-2 text-error-500">*</span></label
				>

				{#if errorStatus.email.status}
					<div class="absolute top-11 left-0 text-xs text-error-500">
						{errorStatus.email.msg}
					</div>
				{/if}
			</div>

			<div class="flex gap-4 items-center mt-4">
				<button type="submit" class="btn btn-sm rounded-lg border bg-surface-600 text-white"
					>{$LL.LOGIN_SendResetMail()}</button
				>
				<button on:click={() => (forgot = false)} class="btn btn-sm text-surface-600 "
					><Icon icon="mdi:arrow-left-circle" width="36" /></button
				>
			</div>
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
