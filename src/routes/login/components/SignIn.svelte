<!-- 
@file src/routes/login/components/SignIn.svelte
@description SignIn component with OAuth support
-->

<script lang="ts">
	import { privateEnv } from '@root/config/private';
	import { browser } from '$app/environment';

	// Stores
	import { page } from '$app/stores';
	import type { PageData } from '../$types';

	// Superforms
	import { superForm } from 'sveltekit-superforms/client';
	import { valibot } from 'sveltekit-superforms/adapters';
	import { loginFormSchema, forgotFormSchema, resetFormSchema } from '@utils/formSchemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { LoginFormSchema, ForgotFormSchema, ResetFormSchema } from '@utils/formSchemas';

	// Components
	import SiteName from '@components/SiteName.svelte';
	import SigninIcon from './icons/SigninIcon.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import PasswordStrength from '@components/PasswordStrength.svelte';

	// Skeleton
	import { Toast, getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	const {
		active = $bindable(undefined),
		FormSchemaLogin,
		FormSchemaForgot,
		FormSchemaReset,
		onClick = () => {},
		onPointerEnter = () => {},
		onBack = () => {},
		isTransitioning = false
	} = $props<{
		active?: undefined | 0 | 1;
		FormSchemaLogin: SuperValidated<LoginFormSchema>;
		FormSchemaForgot: SuperValidated<ForgotFormSchema>;
		FormSchemaReset: SuperValidated<ResetFormSchema>;
		onClick?: () => void;
		onPointerEnter?: () => void;
		onBack?: () => void;
		isTransitioning?: boolean;
	}>();

	// State management
	let PWforgot = $state(false);
	let PWreset = $state(false);
	let showPassword = $state(false);
	let formElement = $state<HTMLFormElement | null>(null);
	let tabIndex = $state(1);
	let isSubmitting = $state(false);
	let registration_token = $state('');
	let hide_email = $state('');

	// Pre-calculate tab indices
	const emailTabIndex = 1;
	const passwordTabIndex = 2;
	const confirmPasswordTabIndex = 3;
	const forgotPasswordTabIndex = 4;

	const pageData = $page.data as PageData;
	const firstUserExists = pageData.firstUserExists;

	// URL handling
	const current_url = $state(browser ? window.location.href : '');

	// Side effect for URL token handling
	$effect(() => {
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
	});

	// Login form setup
	const { form, constraints, allErrors, errors, enhance, delayed } = superForm(FormSchemaLogin, {
		id: 'login',
		validators: valibot(loginFormSchema),
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			if (isTransitioning || isSubmitting) {
				cancel();
				return;
			}
			isSubmitting = true;

			if (typeof $form.email === 'string') {
				$form.email = $form.email.toLowerCase(); // Submit email as lowercase only
			}

			// handle login form submission
			if ($allErrors.length > 0) {
				cancel();
				isSubmitting = false;
				formElement?.classList.add('wiggle');
				setTimeout(() => formElement?.classList.remove('wiggle'), 300);
			}
		},

		onResult: ({ result, cancel }) => {
			if (result.type === 'redirect') {
				// Trigger the toast
				toastStore.trigger({
					message: m.signin_signinsuccess(),
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 4000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				});
				isSubmitting = false;
				return;
			}
			cancel();

			// add wiggle animation to form element
			formElement?.classList.add('wiggle');
			setTimeout(() => {
				formElement?.classList.remove('wiggle');
				isSubmitting = false;
			}, 300);
		}
	});

	// Forgot Form setup
	const {
		form: forgotForm,
		allErrors: forgotAllErrors,
		errors: forgotErrors,
		enhance: forgotEnhance,
		delayed: forgotDelayed
	} = superForm(FormSchemaForgot, {
		id: 'forgot',
		validators: valibot(forgotFormSchema),
		resetForm: true,
		invalidateAll: false,
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			if (isTransitioning || isSubmitting) {
				cancel();
				return;
			}
			isSubmitting = true;

			if (typeof $forgotForm.email === 'string') {
				$forgotForm.email = $forgotForm.email.toLowerCase(); // Submit email as lowercase only
			}

			// handle login form submission
			if ($allErrors.length > 0) {
				cancel();
				isSubmitting = false;
				formElement?.classList.add('wiggle');
				setTimeout(() => formElement?.classList.remove('wiggle'), 300);
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
				toastStore.trigger({
					message: errorMessages,
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 4000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				});
				isSubmitting = false;
				return;
			}

			if (result.type === 'success') {
				if (result.data !== undefined && result.data.status === false) {
					PWreset = false;
					formElement?.classList.add('wiggle');
					setTimeout(() => {
						formElement?.classList.remove('wiggle');
						isSubmitting = false;
					}, 300);
					return;
				} else {
					PWreset = true;
					toastStore.trigger({
						message: m.signin_forgottontoast(),
						background: 'variant-filled-primary',
						timeout: 4000,
						classes: 'border-1 !rounded-md'
					});
					isSubmitting = false;
					return;
				}
			}

			cancel();
			formElement?.classList.add('wiggle');
			setTimeout(() => {
				formElement?.classList.remove('wiggle');
				isSubmitting = false;
			}, 300);
		}
	});

	// Reset Form setup
	const {
		form: resetForm,
		allErrors: resetAllErrors,
		errors: resetErrors,
		enhance: resetEnhance,
		delayed: resetDelayed
	} = superForm(FormSchemaReset, {
		id: 'reset',
		validators: valibot(resetFormSchema),
		resetForm: true,
		invalidateAll: false,
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			if (isTransitioning || isSubmitting) {
				cancel();
				return;
			}
			isSubmitting = true;

			if ($allErrors.length > 0) {
				cancel();
				isSubmitting = false;
			}
		},

		onResult: ({ result, cancel }) => {
			// update variables to display login page
			PWreset = false;
			PWforgot = false;

			if (result.type === 'success' || result.type === 'redirect') {
				// Trigger the Reset toast
				toastStore.trigger({
					message: m.signin_restpasswordtoast(),
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: result.type === 'redirect' ? 3000 : 4000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				});
				isSubmitting = false;
				if (result.type === 'redirect') return;
			}

			cancel();
			formElement?.classList.add('wiggle');
			setTimeout(() => {
				formElement?.classList.remove('wiggle');
				isSubmitting = false;
			}, 300);
		}
	});

	// Event handlers
	function handleOAuth() {
		if (isTransitioning || isSubmitting) return;
		isSubmitting = true;
		const form = document.createElement('form');
		form.method = 'post';
		form.action = '?/OAuth';
		document.body.appendChild(form);
		form.submit();
		document.body.removeChild(form);
		setTimeout(() => {
			isSubmitting = false;
		}, 300);
	}

	// Function to handle back button click
	function handleBack(event: Event) {
		if (isTransitioning || isSubmitting) return;
		event.stopPropagation();
		onBack();
	}

	// Function to handle icon click
	function handleIconClick() {
		if (isTransitioning || isSubmitting) return;
		onClick();
	}

	// Function to handle forgot password click
	function handleForgotPassword() {
		if (isTransitioning || isSubmitting) return;
		PWforgot = true;
		PWreset = false;
	}

	// Class computations
	const isActive = $derived(active === 0);
	const isInactive = $derived(active !== undefined && active !== 0);
	const isHover = $derived(active === undefined || active === 1);
	const isDisabled = $derived(isTransitioning || isSubmitting);

	const baseClasses = 'hover relative flex items-center';
</script>

<Toast />

<section
	onclick={onClick}
	onkeydown={(e) => e.key === 'Enter' && onClick?.()}
	onpointerenter={onPointerEnter}
	role="button"
	tabindex={tabIndex}
	class={baseClasses}
	class:active={isActive}
	class:inactive={isInactive}
	class:hover={isHover}
	class:pointer-events-none={isDisabled}
>
	{#if active === 0}
		<!-- CSS Logo -->
		<div class="hidden xl:block"><SveltyCMSLogoFull /></div>

		<div class="mx-auto mb-[5%] mt-[15%] w-full overflow-y-auto p-4 lg:w-1/2" class:hide={active !== 0}>
			<div class="mb-1 flex flex-row gap-2">
				<SveltyCMSLogo className="w-14" fill="red" />

				<h1 class="text-3xl font-bold text-black lg:text-4xl">
					<div class="text-xs text-surface-300"><SiteName /></div>
					{#if !PWforgot && !PWreset}
						<div class="lg:-mt-1">{m.form_signin()}</div>
					{:else if PWforgot && !PWreset}
						<div class="text-2xl lg:-mt-1 lg:text-4xl">{m.signin_forgottenpassword()}</div>
					{:else if PWforgot && PWreset}
						<div class="lg:-mt-1">{m.form_resetpassword()}</div>
					{/if}
				</h1>
			</div>

			<!-- Required with Back button -->
			<div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500">
				{m.form_required()}

				<button onclick={handleBack} aria-label="Back" class="variant-outline-secondary btn-icon">
					<iconify-icon icon="ri:arrow-right-line" width="20" class="text-black"></iconify-icon>
				</button>
			</div>

			{#if firstUserExists}
				<!-- Sign In -->
				{#if !PWforgot && !PWreset}
					<form method="post" action="?/signIn" use:enhance bind:this={formElement} class="flex w-full flex-col gap-3" class:hide={active !== 0}>
						<!-- Email field -->
						<FloatingInput
							id="emailsignIn"
							name="email"
							type="email"
							tabindex={emailTabIndex}
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
							tabindex={passwordTabIndex}
							bind:value={$form.password}
							{...$constraints.password}
							{showPassword}
							label={m.form_password()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
						/>
						{#if $errors.password}<span class="invalid text-xs text-error-500">{$errors.password}</span>{/if}

						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
							<!-- Row 1 -->
							<div class="flex w-full justify-between gap-2 sm:w-auto">
								<button type="submit" class="variant-filled-surface btn w-full sm:w-auto" aria-label={m.form_signin()}>
									{m.form_signin()}
									<!-- Loading indicators -->
									{#if $delayed || isSubmitting}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
								</button>

								{#if privateEnv.USE_GOOGLE_OAUTH === true}
									<button type="button" onclick={handleOAuth} aria-label="OAuth" class="variant-filled-surface btn w-full sm:w-auto">
										<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1"></iconify-icon>
										<p>OAuth</p>
									</button>
								{/if}
							</div>

							<!-- Row 2 -->
							<div class="mt-4 flex w-full justify-between sm:mt-0 sm:w-auto">
								<button
									type="button"
									class="variant-ringed-surface btn w-full text-black sm:w-auto"
									aria-label={m.signin_forgottenpassword()}
									tabindex={forgotPasswordTabIndex}
									onclick={handleForgotPassword}
									>{m.signin_forgottenpassword()}
								</button>
							</div>
						</div>
					</form>
				{/if}

				<!-- Forgotten Password -->
				{#if PWforgot && !PWreset}
					<form
						method="post"
						action="?/forgotPassword"
						use:forgotEnhance
						bind:this={formElement}
						class="flex w-full flex-col gap-3"
						class:hide={active !== 0}
					>
						<!-- Email field -->
						<FloatingInput
							id="emailforgot"
							name="email"
							type="email"
							tabindex={emailTabIndex}
							bind:value={$forgotForm.email}
							label={m.form_emailaddress()}
							{...$constraints.email}
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

						<div class="mt-4 flex items-center justify-between">
							<button type="submit" class="variant-filled-surface btn" aria-label={m.form_resetpassword()}>
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
								aria-label="Back"
								onclick={() => {
									PWforgot = false;
									PWreset = false;
								}}
							>
								<iconify-icon icon="mdi:arrow-left-circle" width="38"></iconify-icon>
							</button>
						</div>
					</form>
				{/if}

				<!-- Reset Password -->
				{#if PWforgot && PWreset}
					<form
						method="post"
						action="?/resetPassword"
						use:resetEnhance
						bind:this={formElement}
						class="flex w-full flex-col gap-3"
						class:hide={active !== 0}
					>
						<!-- Hidden fields -->
						<input type="hidden" name="email" bind:value={$resetForm.email} />
						<input type="hidden" name="token" bind:value={$resetForm.token} />

						<!-- Password field -->
						<FloatingInput
							id="passwordreset"
							name="password"
							type="password"
							tabindex={passwordTabIndex}
							bind:value={$resetForm.password}
							{...$constraints.password}
							{showPassword}
							label={m.form_password()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
						/>
						{#if $resetErrors.password}
							<span class="invalid text-xs text-error-500">
								{$resetErrors.password}
							</span>
						{/if}

						<!-- Confirm Password field -->
						<FloatingInput
							id="confirm_passwordreset"
							name="confirm_password"
							type="password"
							tabindex={confirmPasswordTabIndex}
							bind:value={$resetForm.confirm_password}
							{...$constraints.confirm_password}
							{showPassword}
							label={m.form_confirmpassword()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
						/>
						{#if $resetErrors.confirm_password}
							<span class="invalid text-xs text-error-500">
								{$resetErrors.confirm_password}
							</span>
						{/if}

						<!-- Password Strength Indicator -->
						<PasswordStrength password={$resetForm.password} confirmPassword={$resetForm.confirm_password} />
						<!-- Registration Token -->
						<FloatingInput
							id="tokenresetPW"
							name="token"
							type="password"
							bind:value={$resetForm.token}
							{showPassword}
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
							<button type="submit" aria-label={m.signin_savenewpassword()} class="variant-filled-surface btn ml-2 mt-6">
								{m.signin_savenewpassword()}
								<!-- Loading indicators -->
								{#if $resetDelayed}
									<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />
								{/if}
							</button>

							<!-- Back button  -->
							<button
								type="button"
								aria-label={m.button_back()}
								class="variant-filled-surface btn-icon"
								onclick={() => {
									PWforgot = false;
									PWreset = false;
								}}
							>
								<iconify-icon icon="mdi:arrow-left-circle" width="38"></iconify-icon>
							</button>
						</div>
					</form>
				{/if}
			{:else}
				<button onclick={onClick} type="button" aria-label="Signup" class="variant-ghost btn mt-2 w-full flex-col justify-center text-surface-500">
					<p class="font-bold text-error-500">No users exist yet.</p>
					<p>Please sign up to create the <span class="font-bold text-tertiary-500">first admin </span> account.</p>
				</button>
			{/if}
		</div>
	{/if}

	<SigninIcon show={active === 1 || active === undefined} onClick={handleIconClick} disabled={isTransitioning || isSubmitting} />
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
