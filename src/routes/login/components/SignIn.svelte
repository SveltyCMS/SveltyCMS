<script lang="ts">
	import type { PageData } from '../$types';
	import { publicEnv } from '@root/config/public';
	import { privateEnv } from '@root/config/private';

	// Superforms
	// import SuperDebug from 'sveltekit-superforms/client/SuperDebug.svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { zod } from 'sveltekit-superforms/adapters';
	import { loginFormSchema, forgotFormSchema, resetFormSchema } from '@utils/formSchemas';

	// Components
	import SigninIcon from './icons/SigninIcon.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';

	// Skeleton
	import { Toast, getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	let showPassword = false;

	export let registration_token = '';
	export let hide_email = '';

	export let active: undefined | 0 | 1 = undefined;
	export const show = false;
	export let PWforgot: boolean = false;
	export let PWreset: boolean = false;

	// Redirect from email to restore password page
	const current_url = window.location.href;

	if (current_url.includes('/login') && current_url.search('token') > -1) {
		// Set flags and extract token/email for password reset flow

		PWforgot = true;
		PWreset = true;
		const start = current_url.indexOf('=') + 1;
		const end = current_url.indexOf('&');
		registration_token = current_url.slice(start, end);

		const emailStart = current_url.indexOf('email=') + 6;
		hide_email = current_url.slice(emailStart, current_url.length);
	}

	// Login Form
	export let FormSchemaLogin: PageData['loginForm'];
	const { form, constraints, allErrors, errors, enhance, delayed } = superForm(FormSchemaLogin, {
		id: 'login',
		validators: zod(loginFormSchema),
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			// Submit email as lowercase only
			$form.email = $form.email.toLowerCase();

			// Trigger the login error toast
			// const t = {
			// 	message: m.form_wrong(),
			// 	// Provide any utility or variant background style:
			// 	background: 'variant-filled-error',
			// 	timeout: 4000,
			// 	// Add your custom classes here:
			// 	classes: 'border-1 !rounded-md'
			// };
			// toastStore.trigger(t);

			// handle login form submission
			if ($allErrors.length > 0) {
				cancel();
				formElement.classList.add('wiggle');
				setTimeout(() => formElement.classList.remove('wiggle'), 300);
			}
		},

		onResult: ({ result, cancel }) => {
			// handle SignIn form result
			if (result.type == 'redirect') {
				// Trigger the toast
				const t = {
					message: m.signin_signinsuccess(),
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 4000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				return;
			}
			cancel();

			// add wiggle animation to form element
			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);
		}
	});

	// Forgot Form
	export let FormSchemaForgot: PageData['forgotForm'];
	const {
		form: forgotForm,
		allErrors: forgotAllErrors,
		errors: forgotErrors,
		enhance: forgotEnhance,
		delayed: forgotDelayed
	} = superForm(FormSchemaForgot, {
		id: 'forgot',
		validators: zod(forgotFormSchema),
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			// Submit email as lowercase only
			$forgotForm.email = $forgotForm.email.toLowerCase();

			// handle login form submission
			if ($allErrors.length > 0) {
				cancel();

				formElement.classList.add('wiggle');
				setTimeout(() => formElement.classList.remove('wiggle'), 300);
			}
		},

		onResult: ({ result, cancel }) => {
			// handle forgot form result
			if (result.type === 'error') {
				// Transform the array of error messages into a single string
				let errorMessages = '';
				forgotAllErrors.subscribe((errors) => {
					errorMessages = errors.map((error) => error.messages.join(', ')).join('; ');
				});

				// Trigger the toast
				const t = {
					message: errorMessages,
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 4000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				return;
			}

			if (result.type === 'success') {
				if (result.data !== undefined && result.data.status === false) {
					PWreset = false;
					formElement.classList.add('wiggle');
					setTimeout(() => formElement.classList.remove('wiggle'), 300);
					return;
				} else if (result.data !== undefined) {
					// Update variables to display reset form page
					PWreset = true;

					// // Update the $resetForm object directly
					$resetForm = {
						...$resetForm,
						email: result.data.email,
						token: result.data.token
					};

					// Update the registration_token and hide_email variables
					registration_token = result.data.token;
					hide_email = result.data.email;

					// Trigger the Forgotten toast
					const t = {
						message: m.signin_forgottontoast(),
						// Provide any utility or variant background style:
						background: 'variant-filled-primary',
						timeout: 4000,
						// Add your custom classes here:
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
					return;
				}
			}

			cancel();

			// add wiggle animation to form element
			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);
		}
	});

	// Reset Form
	export let FormSchemaReset: PageData['resetForm'];
	const {
		form: resetForm,
		allErrors: resetAllErrors,
		errors: resetErrors,
		enhance: resetEnhance,
		delayed: resetDelayed
	} = superForm(FormSchemaReset, {
		id: 'reset',
		validators: zod(resetFormSchema),
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			// handle login form submission
			if ($allErrors.length > 0) cancel();
		},

		onResult: ({ result, cancel }) => {
			// update variables to display login page
			PWreset = false;
			PWforgot = false;

			if (result.type === 'error') {
				// Extract and format error messages
				let errorMessages = '';
				allErrors.subscribe((errors) => {
					errorMessages = errors.map((error) => error.messages.join(', ')).join('; ');
				});
			} else if (result.type === 'success') {
				// Trigger the Reset toast
				const t = {
					message: m.signin_restpasswordtoast(),
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 4000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			} else if (result.type === 'redirect') {
				// Trigger the toast
				const t = {
					message: m.signin_restpasswordtoast(),
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 3000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				return;
			}

			cancel();

			// add wiggle animation to form element (only if result type is not "success" or "redirect")
			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);
		}
	});

	let formElement: HTMLFormElement; // reactive statement when systemLanguage changes

	$: $forgotForm = { ...$forgotForm };

	$resetForm = {
		...$resetForm,
		email: hide_email,
		token: registration_token
	};
</script>

<Toast />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<section
	on:click
	on:pointerenter
	on:keydown
	class="hover relative flex items-center"
	class:active={active == 0}
	class:inactive={active !== undefined && active !== 0}
	class:hover={active == undefined || active == 1}
>
	{#if active == 0}
		<!-- CSS Logo -->
		<div class="hidden xl:block"><SveltyCMSLogoFull /></div>

		<div class="mx-auto mb-[5%] mt-[15%] w-full overflow-y-auto p-4 lg:w-1/2" class:hide={active != 0}>
			<div class="mb-1 flex flex-row gap-2">
				<SveltyCMSLogo className="w-14" fill="red" />

				<h1 class="text-3xl font-bold text-black lg:text-4xl">
					<div class="text-xs text-surface-300">{publicEnv.SITE_NAME}</div>
					{#if !PWforgot && !PWreset}
						<div class="lg:-mt-1">{m.form_signin()}</div>
					{:else if PWforgot && !PWreset}
						<div class="text-2xl lg:-mt-1 lg:text-4xl">{m.signin_forgottenpassword()}</div>
					{:else if PWforgot && PWreset}
						<div class="lg:-mt-1">{m.form_resetpassword()}</div>
					{/if}
				</h1>
			</div>

			<div class="-mt-2 text-right text-xs text-error-500">{m.form_required()}</div>

			<!-- Sign In -->
			{#if !PWforgot && !PWreset}
				<!-- <SuperDebug data={$form} display={dev} /> -->
				<form method="post" action="?/signIn" use:enhance bind:this={formElement} class="flex w-full flex-col gap-3" class:hide={active != 0}>
					<!-- Email field -->
					<FloatingInput
						id="emailsignIn"
						name="email"
						type="email"
						bind:value={$form.email}
						label={m.form_emailaddress()}
						{...$constraints.email}
						icon="mdi:email"
						iconColor="black"
						textColor="black"
					/>
					{#if $errors.email}<span class="invalid text-xs text-error-500">{$errors.email}</span>{/if}

					<!-- Password field -->
					<FloatingInput
						id="passwordsignIn"
						name="password"
						type="password"
						bind:value={$form.password}
						{...$constraints.password}
						bind:showPassword
						label={m.form_password()}
						icon="mdi:lock"
						iconColor="black"
						textColor="black"
					/>
					{#if $errors.password}<span class="invalid text-xs text-error-500">{$errors.password}</span>{/if}

					<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
						<!-- Row 1 -->
						<div class="flex w-full justify-between gap-2 sm:w-auto">
							<button type="submit" class="variant-filled-surface btn w-full sm:w-auto">
								{m.form_signin()}
								<!-- Loading indicators -->
								{#if $delayed}
									<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />
								{/if}
							</button>

							{#if privateEnv.USE_GOOGLE_OAUTH == true}
								<form method="post" action="?/OAuth" class="flex w-full sm:w-auto">
									<button type="submit" class="variant-filled-surface btn w-full sm:w-auto">
										<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1" />
										<p>OAuth</p>
									</button>
								</form>
							{/if}
						</div>

						<!-- Row 2 -->
						<div class="mt-4 flex w-full justify-between sm:mt-0 sm:w-auto">
							<button
								type="button"
								class="variant-ringed-surface btn w-full text-black sm:w-auto"
								on:click={() => {
									PWforgot = true;
									PWreset = false;
								}}
								>{m.signin_forgottenpassword()}
							</button>
						</div>
					</div>
				</form>
			{/if}

			<!-- Forgotten Password -->
			{#if PWforgot && !PWreset}
				<!-- <SuperDebug data={$forgotForm} display={dev} /> -->
				<form method="post" action="?/forgotPW" use:forgotEnhance bind:this={formElement} class="flex w-full flex-col gap-3">
					<div class="mb-2 text-center text-sm text-black">
						<p class="mb-2 text-xs text-tertiary-500">{m.signin_forgottenpasswordtext()}</p>
					</div>
					<!-- Email field -->
					<FloatingInput
						id="emailforgotPW"
						name="email"
						type="email"
						bind:value={$forgotForm.email}
						required
						label={m.form_emailaddress()}
						icon="mdi:email"
						iconColor="black"
						textColor="black"
					/>
					{#if $forgotErrors.email}
						<span class="invalid text-xs text-error-500">
							{$forgotErrors.email}
						</span>
					{/if}

					{#if $forgotAllErrors && !$forgotErrors.email}
						<span class="invalid text-xs text-error-500">
							{$forgotAllErrors}
						</span>
					{/if}

					<!-- <input type="hidden" name="lang" bind:value={$forgotForm.lang} hidden /> -->

					<div class="mt-4 flex items-center justify-between">
						<button type="submit" class="variant-filled-surface btn">
							{m.form_resetpassword()}
						</button>

						<!-- Loading indicators -->
						{#if $forgotDelayed}
							<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />
						{/if}

						<!-- Back button  -->
						<button
							type="button"
							class="variant-filled-surface btn-icon"
							on:click={() => {
								PWforgot = false;
								PWreset = false;
							}}
						>
							<iconify-icon icon="mdi:arrow-left-circle" width="38" />
						</button>
					</div>
				</form>
			{/if}

			<!-- Reset Password -->
			{#if PWforgot && PWreset}
				<!-- <SuperDebug data={$resetForm} /> -->
				<form method="post" action="?/resetPW" use:resetEnhance bind:this={formElement} class="flex w-full flex-col gap-3">
					<!-- Password field -->

					<FloatingInput
						id="passwordresetPW"
						name="password"
						type="password"
						bind:value={$resetForm.password}
						bind:showPassword
						label={m.form_password()}
						icon="mdi:lock"
						iconColor="black"
						textColor="black"
						required
					/>
					{#if $resetErrors.password}
						<span class="invalid text-xs text-error-500">
							{$resetErrors.password}
						</span>
					{/if}

					<!-- Password  Confirm field -->
					<FloatingInput
						id="confirm_passwordresetPW"
						name="confirm_password"
						type="password"
						bind:value={$resetForm.confirm_password}
						bind:showPassword
						label={m.form_confirmpassword()}
						icon="mdi:lock"
						iconColor="black"
						textColor="black"
						required
					/>
					{#if $resetErrors.confirm_password}
						<span class="invalid text-xs text-error-500">
							{$resetErrors.confirm_password}
						</span>
					{/if}

					<!-- Registration Token -->
					<FloatingInput
						id="tokenresetPW"
						name="token"
						type="password"
						bind:value={$resetForm.token}
						bind:showPassword
						label={m.signin_registrationtoken()}
						icon="mdi:lock"
						iconColor="black"
						textColor="black"
						required
					/>

					{#if $resetErrors.token}
						<span class="invalid text-xs text-error-500">
							{$resetErrors.token}
						</span>
					{/if}

					{#if $resetAllErrors && !$resetErrors}
						<span class="invalid text-xs text-error-500">
							{$resetAllErrors}
						</span>
					{/if}

					<input type="email" name="email" bind:value={$resetForm.email} hidden />

					<div class="mt-4 flex items-center justify-between">
						<button type="submit" class="variant-filled-surface btn ml-2 mt-6">
							{m.signin_savenewpassword()}
							<!-- Loading indicators -->
							{#if $resetDelayed}
								<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />
							{/if}
						</button>

						<!-- Back button  -->
						<button
							type="button"
							class="variant-filled-surface btn-icon"
							on:click={() => {
								PWforgot = false;
								PWreset = false;
							}}
						>
							<iconify-icon icon="mdi:arrow-left-circle" width="38" />
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}

	<SigninIcon show={active == 1 || active == undefined} />
</section>

<style lang="postcss">
	.hide {
		transition: 0s;
		opacity: 0;
	}
	section {
		--width: 0%;
		background: white;
		flex-grow: 1;
		width: var(--width);
		transition: 0.4s;
	}
	.active {
		--width: 90%;
	}
	.inactive {
		--width: 10%;
	}
	.hover:hover {
		border-top-right-radius: 5% 50%;
		border-bottom-right-radius: 5% 50%;
		width: calc(var(--width) + 10%);
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
