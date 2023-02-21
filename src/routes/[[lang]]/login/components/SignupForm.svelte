<script lang="ts">
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	import axios from 'axios';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import { enhance } from '$app/forms';

	import { PUBLIC_SITENAME } from '$env/static/public';
	import CMSLogo from './icons/Logo.svelte';

	export let show = false;
	let showPassword = false;

	//import { firstUserExists } from 'user-models';
	export let firstUserExists = true;
	console.log(firstUserExists);

	let username = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let token = ''; // token need to be compared to admin provided token
	let terms = '';

	// zod
	// import z from 'zod';
	// const signupSchema = z
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
	// 			}),
	// 		token: z.number({ required_error: 'Auth Token is required' }).min(1),
	// 		terms: z.boolean({ required_error: 'Confirm Terms' })
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

	// const validate = () => {
	// 	try {
	// 		signupSchema.parse({ email, password });
	// 		errors = {};
	// 		errorStatus.email.status = false;
	// 		errorStatus.email.msg = '';
	// 		errorStatus.password.status = false;
	// 		errorStatus.password.msg = '';
	// 		isWiggling = false;
	// 		return true;
	// 	} catch (error) {
	// 		errors = error.formErrors.fieldErrors;
	// 		errorStatus.email.status = true;
	// 		errorStatus.email.msg = error.formErrors.fieldErrors.email;
	// 		errorStatus.password.status = true;
	// 		errorStatus.password.msg = error.formErrors.fieldErrors.password;
	// 		isWiggling = true;
	// 		return false;
	// 	}
	// };

	// const handleSubmit = async (event) => {
	// 	event.preventDefault();
	// 	if (validate()) {
	// 		try {
	// 			const response = await axios.post('/signup', { email, password });
	// 			console.log(response.data);
	// 		} catch (error) {
	// 			console.error(error);
	// 		}
	// 	}
	// };

	// onMount(() => {
	// 	emailInput.focus();
	// });

	let errors = {};
	let isWiggling = false;

	let errorStatus = {
		username: { status: false, msg: '' },
		email: { status: false, msg: '' },
		password: { status: false, msg: '' },
		confirm: { status: false, msg: '' },
		token: { status: false, msg: '' },
		terms: { status: false, msg: '' }
	};

	function hasSignUpError() {
		// Validation
		email = email.trim();
		let emailRegex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
		let error = false;

		// Username check
		if (!username) {
			errorStatus.username.msg = $LL.LOGIN_usernamemsg_empty();
		}

		// Email check
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

		// Password check
		if (!password) {
			errorStatus.password.msg = $LL.LOGIN_passwordmsg_empty();
			errorStatus.password.status = true;
			error = true;
		}

		if (password !== confirmPassword) {
			errorStatus.confirm.msg = $LL.LOGIN_passwordmsg_confirm();
			errorStatus.confirm.status = true;
			error = true;
		}

		// token check after 1st user
		if (firstUserExists && (token === '' || token === null || typeof token === 'undefined')) {
			errorStatus.token.msg = $LL.LOGIN_Token();
			errorStatus.token.status = true;
			error = true;
		}

		return error;
	}
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
			method="post"
			action="?/createUser"
			use:enhance={(e) => {
				if (hasSignUpError()) {
					e.cancel();
				}
			}}
		>
			<!-- Username field -->
			<div class="group relative z-0 mb-6 w-full">
				<Icon icon="mdi:user-circle" width="18" class="absolute top-3.5 left-0 text-gray-400" />
				<input
					bind:value={username}
					on:keydown={() => (errorStatus.username.status = false)}
					color={errorStatus.username.status ? 'red' : 'base'}
					type="text"
					name="floating_username"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-8 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>
				<label
					for="floating_username"
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
					type="email"
					name="floating_email"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-8 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
				/>
				<label
					for="floating_email"
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
						name="floating_password"
						autocomplete="current-password"
						id="floating_password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-8 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						required
					/>{:else}
					<input
						bind:value={password}
						on:keydown={() => (errorStatus.password.status = false)}
						color={errorStatus.password.status ? 'red' : 'base'}
						type="password"
						name="floating_password"
						autocomplete="current-password"
						id="floating_password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-8 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						required
					/>{/if}
				<label
					for="floating_password"
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
						on:keydown={() => (errorStatus.confirm.status = false)}
						color={errorStatus.confirm.status ? 'red' : 'base'}
						type="text"
						name="repeat_password"
						id="floating_repeat_password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-8 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						required
					/><label
						for="floating_repeat_password"
						class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-surface-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
						>{$LL.LOGIN_ConfirmPassword()}<span class="ml-2 text-error-500">*</span></label
					>
				{:else}
					<input
						bind:value={confirmPassword}
						on:keydown={() => (errorStatus.confirm.status = false)}
						color={errorStatus.confirm.status ? 'red' : 'base'}
						type="password"
						name="repeat_password"
						id="floating_repeat_password"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-8 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						required
					/>
					<label
						for="floating_repeat_password"
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
			<!-- Registration Token -->
			{#if firstUserExists}
				<div class="group relative z-0 mb-6 w-full">
					<Icon icon="mdi:key-chain" width="18" class="absolute top-3.5 left-0 text-gray-400" />
					<input
						bind:value={token}
						on:keydown={() => (errorStatus.token.status = false)}
						color={errorStatus.token.status ? 'red' : 'base'}
						type="text"
						name="Access Token"
						id="floating_token"
						class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-8 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
						placeholder=" "
						required
					/>
					<label
						for="floating_token"
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
