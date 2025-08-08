<!-- 
@file src/routes/login/components/SignIn.svelte
@component
**SignIn component with OAuth support**

Features:
 - Dual SignIn and SignUp functionality with dynamic form switching
 - Dynamic language selection with a debounced input field or dropdown for multiple languages
 - Demo mode support with auto-reset timer displayed when active
 - Initial form display adapts based on environment variables (`SEASON`, `DEMO`, and `firstUserExists`)
 - Reset state functionality for easy return to initial screen
 - Accessibility features for language selection and form navigation
-->

<script lang="ts">
	import { browser } from '$app/environment';

	// Stores
	import { page } from '$app/state';
	import type { PageData } from '../$types';

	// Superforms
	import { superForm } from 'sveltekit-superforms/client';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { LoginFormSchema, ForgotFormSchema, ResetFormSchema } from '@utils/formSchemas';

	// Components
	import SiteName from '@components/SiteName.svelte';
	import SigninIcon from './icons/SigninIcon.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import PasswordStrength from '@components/PasswordStrength.svelte';
	// Lazy-load FloatingPaths on desktop for performance
	let FloatingPathsComponent = $state<any>(null);

	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import OauthLogin from './OauthLogin.svelte';

	// Screen size store
	import { isDesktop, isTablet, isMobile, screenSize, screenWidth } from '@stores/screenSizeStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Props
	const {
		active = $bindable(undefined),
		FormSchemaLogin,
		FormSchemaForgot,
		FormSchemaReset,
		onClick = () => {},
		onPointerEnter = () => {},
		onBack = () => {}
	} = $props<{
		active?: undefined | 0 | 1;
		FormSchemaLogin: SuperValidated<LoginFormSchema>;
		FormSchemaForgot: SuperValidated<ForgotFormSchema>;
		FormSchemaReset: SuperValidated<ResetFormSchema>;
		onClick?: () => void;
		onPointerEnter?: () => void;
		onBack?: () => void;
	}>();

	// State management
	let PWforgot = $state(false);
	let PWreset = $state(false);
	let showPassword = $state(false);
	let formElement = $state<HTMLFormElement | null>(null);
	let tabIndex = $state(1);

	// Pre-calculate tab indices
	const emailTabIndex = 1;
	const passwordTabIndex = 2;
	const confirmPasswordTabIndex = 3;
	const forgotPasswordTabIndex = 4;
	const pageData = page.data as PageData;
	const firstUserExists = pageData.firstUserExists;

	// URL handling
	const current_url = $state(browser ? window.location.href : '');

	// State for improved spinner control
	let isSubmitting = $state(false);
	let isAuthenticating = $state(false);

	// 2FA state
	let requires2FA = $state(false);
	let twoFAUserId = $state('');
	let twoFACode = $state('');
	let useBackupCode = $state(false);
	let isVerifying2FA = $state(false);

	// Login form setup
	const { form, constraints, allErrors, errors, enhance } = superForm(FormSchemaLogin, {
		id: 'login',
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			if (typeof $form.email === 'string') {
				$form.email = $form.email.toLowerCase(); // Submit email as lowercase only
			}

			// handle login form submission
			if ($allErrors.length > 0) {
				cancel();

				formElement?.classList.add('wiggle');
				setTimeout(() => formElement?.classList.remove('wiggle'), 300);
				return;
			}

			// Set submitting state for better UX
			isSubmitting = true;
			isAuthenticating = true;
			globalLoadingStore.startLoading(loadingOperations.authentication);
		},

		onResult: ({ result, cancel }) => {
			// Reset submitting state
			isSubmitting = false;

			if (result.type === 'redirect') {
				// Keep authenticating state for redirect phase
				isAuthenticating = true;

				// Trigger the toast
				toastStore.trigger({
					message: m.signin_signinsuccess(),
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 1500, // Reduced timeout for faster UX
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				});

				// Clear authenticating state immediately for faster navigation
				setTimeout(() => {
					isAuthenticating = false;
					globalLoadingStore.stopLoading(loadingOperations.authentication);
				}, 100);

				return;
			}

			// Check if 2FA is required
			if (result.type === 'failure' && result.data?.requires2FA) {
				requires2FA = true;
				twoFAUserId = result.data.userId || '';
				isAuthenticating = false;
				globalLoadingStore.stopLoading(loadingOperations.authentication);

				// Show 2FA required message
				toastStore.trigger({
					message: m.twofa_verify_title(),
					background: 'variant-filled-warning',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				});

				cancel();
				return;
			}

			// Reset all states on error
			isAuthenticating = false;
			globalLoadingStore.stopLoading(loadingOperations.authentication);
			cancel();

			// Trigger the toast
			toastStore.trigger({
				message: m.signin_wrong_user_or_password(),
				// Provide any utility or variant background style:
				background: 'variant-filled-error',
				timeout: 4000,
				// Add your custom classes here:
				classes: 'border-1 !rounded-md'
			});

			// add wiggle animation to form element
			formElement?.classList.add('wiggle');
			setTimeout(() => {
				formElement?.classList.remove('wiggle');
			}, 300);
		}
	});

	// Forgot Form setup
	const {
		form: forgotForm,
		constraints: forgotConstraints,
		allErrors: forgotAllErrors,
		errors: forgotErrors,
		enhance: forgotEnhance
	} = superForm(FormSchemaForgot, {
		id: 'forgot',
		resetForm: true,
		invalidateAll: false,
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			if (typeof $forgotForm.email === 'string') {
				$forgotForm.email = $forgotForm.email.toLowerCase();
			}

			// handle login form submission
			if ($forgotAllErrors.length > 0) {
				cancel();

				formElement?.classList.add('wiggle');
				setTimeout(() => formElement?.classList.remove('wiggle'), 300);
				return;
			}

			// Set submitting state
			isSubmitting = true;
		},

		onResult: ({ result, cancel }) => {
			// Reset submitting state
			isSubmitting = false;

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

				return;
			}

			if (result.type === 'success') {
				// Check if user exists
				if (result.data && result.data.userExists === false) {
					// User doesn't exist - show error toast and don't navigate to reset form
					PWreset = false;
					toastStore.trigger({
						message: 'No account found with this email address.',
						background: 'variant-filled-error',
						timeout: 4000,
						classes: 'border-1 !rounded-md'
					});

					// Add wiggle animation to form element
					formElement?.classList.add('wiggle');
					setTimeout(() => {
						formElement?.classList.remove('wiggle');
					}, 300);
					return;
				} else if (result.data && result.data.userExists === true) {
					// User exists and email should have been sent
					PWreset = true;
					toastStore.trigger({
						message: m.signin_forgottontoast(),
						background: 'variant-filled-primary',
						timeout: 4000,
						classes: 'border-1 !rounded-md'
					});
					return;
				} else {
					// Legacy fallback or other success scenarios
					if (result.data !== undefined && result.data.status === false) {
						PWreset = false;
						formElement?.classList.add('wiggle');
						setTimeout(() => {
							formElement?.classList.remove('wiggle');
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
						return;
					}
				}
			}

			cancel();

			// add wiggle animation to form element
			formElement?.classList.add('wiggle');
			setTimeout(() => {
				formElement?.classList.remove('wiggle');
			}, 300);
		}
	});

	// Reset Form setup
	const {
		form: resetForm,
		constraints: resetConstraints,
		allErrors: resetAllErrors,
		errors: resetErrors,
		enhance: resetEnhance
	} = superForm(FormSchemaReset, {
		id: 'reset',
		resetForm: true,
		invalidateAll: false,
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			if ($resetAllErrors.length > 0) {
				cancel();
				return;
			}

			// Set submitting state
			isSubmitting = true;
		},

		onResult: ({ result, cancel }) => {
			// Reset submitting state
			isSubmitting = false;

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

				if (result.type === 'redirect') return;
			}

			cancel();
			formElement?.classList.add('wiggle');
			setTimeout(() => {
				formElement?.classList.remove('wiggle');
			}, 300);
		}
	});

	// 2FA Functions
	async function verify2FA() {
		if (!twoFACode.trim() || isVerifying2FA) return;

		if (!useBackupCode && twoFACode.length !== 6) {
			toastStore.trigger({
				message: m.twofa_error_invalid_code(),
				background: 'variant-filled-error',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			});
			return;
		}

		if (useBackupCode && twoFACode.length < 8) {
			toastStore.trigger({
				message: 'Invalid backup code format',
				background: 'variant-filled-error',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			});
			return;
		}

		isVerifying2FA = true;

		try {
			const formData = new FormData();
			formData.append('userId', twoFAUserId);
			formData.append('code', twoFACode.trim());

			const response = await fetch('?/verify2FA', {
				method: 'POST',
				body: formData
			});

			// Parse response
			if (response.ok) {
				// Success - redirect will be handled by SvelteKit
				toastStore.trigger({
					message: m.twofa_success_verified(),
					background: 'variant-filled-success',
					timeout: 2000,
					classes: 'border-1 !rounded-md'
				});

				// The server will redirect on successful verification
				window.location.reload();
			} else {
				const errorData = await response.json();
				throw new Error(errorData.message || m.twofa_error_invalid_code());
			}
		} catch (error) {
			toastStore.trigger({
				message: error instanceof Error ? error.message : m.twofa_error_invalid_code(),
				background: 'variant-filled-error',
				timeout: 4000,
				classes: 'border-1 !rounded-md'
			});
		} finally {
			isVerifying2FA = false;
		}
	}

	function handle2FAInput(event: Event) {
		const input = event.target as HTMLInputElement;
		let value = input.value;

		if (!useBackupCode) {
			// For TOTP codes, only allow 6 digits
			value = value.replace(/\D/g, '').slice(0, 6);
		} else {
			// For backup codes, allow alphanumeric and remove spaces
			value = value
				.replace(/[^a-zA-Z0-9]/g, '')
				.toLowerCase()
				.slice(0, 10);
		}

		twoFACode = value;
	}

	function toggle2FACodeType() {
		useBackupCode = !useBackupCode;
		twoFACode = '';
	}

	function back2FAToLogin() {
		requires2FA = false;
		twoFAUserId = '';
		twoFACode = '';
		useBackupCode = false;
		isVerifying2FA = false;
	}

	// Side effect for URL token handling
	$effect(() => {
		if (browser && current_url.includes('/login') && current_url.includes('token')) {
			const urlObj = new URL(current_url);
			const tokenParam = urlObj.searchParams.get('token') || '';
			const emailParam = urlObj.searchParams.get('email') || '';
			if (tokenParam && emailParam) {
				// Directly update the reset form with token and email values
				$resetForm.token = tokenParam;
				$resetForm.email = emailParam;

				// Set flags for reset flow
				PWforgot = true;
				PWreset = true;
			}
		}
	});

	// Function to handle back button click
	function handleBack(event: Event) {
		event.stopPropagation();
		if (PWforgot || PWreset) {
			PWforgot = false;
			PWreset = false;
		} else {
			onBack();
		}
	}

	// Function to handle icon click
	function handleFormClick(event: Event) {
		event.stopPropagation();
		onClick();
	}

	// Function to handle forgot password click
	function handleForgotPassword(event: Event) {
		event.stopPropagation();
		PWforgot = true;
		PWreset = false;
	}

	// Class computations
	const isActive = $derived(active === 0);
	const isInactive = $derived(active !== undefined && active !== 0);
	const isHover = $derived(active === undefined || active === 1);

	const baseClasses = 'hover relative flex items-center';

	// Lazy-load FloatingPaths only when needed (desktop + active 0)
	$effect(() => {
		// track dependencies
		const desktop = isDesktop.value;
		const isActiveLogin = active === 0;
		if (browser && desktop && isActiveLogin) {
			import('@root/src/components/system/FloatingPaths.svelte').then((m) => {
				FloatingPathsComponent = m.default;
			});
		} else {
			FloatingPathsComponent = null;
		}
	});
</script>

<section
	onclick={handleFormClick}
	onkeydown={(e) => e.key === 'Enter' && onClick?.()}
	onpointerenter={onPointerEnter}
	role="button"
	tabindex={tabIndex}
	class={baseClasses}
	class:active={isActive}
	class:inactive={isInactive}
	class:hover={isHover}
>
	{#if active === 0}
		<!-- Background pattern  -->
		<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
			{#if isDesktop.value && FloatingPathsComponent}
				<div class="absolute inset-0 z-0">
					<FloatingPathsComponent position={-1} background="white" />
					<FloatingPathsComponent position={1} background="white" />
				</div>
			{/if}

			<div class="absolute left-1/2 top-[20%] hidden -translate-x-1/2 -translate-y-1/2 transform xl:block">
				<SveltyCMSLogoFull />
			</div>
			<!-- CSS Logo -->
			<div class="z-0 mx-auto mb-[5%] mt-[15%] w-full overflow-y-auto rounded-md bg-white p-4 lg:w-4/5" class:hide={active !== 0}>
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
						<form
							id="signin-form"
							method="POST"
							action="?/signIn"
							use:enhance
							bind:this={formElement}
							class="flex w-full flex-col gap-3"
							class:hide={active !== 0}
							inert={active !== 0}
						>
							<!-- Email field -->
							<FloatingInput
								id="emailsignIn"
								name="email"
								type="email"
								tabindex={emailTabIndex}
								autocomplete="username"
								autocapitalize="none"
								spellcheck={false}
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
								autocomplete="current-password"
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
						</form>

						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
							<!-- Row 1 -->
							<div class="flex w-full justify-between gap-2 sm:w-auto">
								<button type="submit" form="signin-form" class="variant-filled-surface btn w-full sm:w-auto" aria-label={m.form_signin()}>
									{m.form_signin()}
									<!-- Optimized loading indicators -->
									{#if isSubmitting || isAuthenticating}
										<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter" />
									{/if}
								</button>
								<!-- OAuth Login -->
								<OauthLogin showOAuth={pageData.showOAuth} />
							</div>

							<!-- Row 2 -->
							<div class="mt-4 flex w-full justify-between sm:mt-0 sm:w-auto">
								<button
									type="button"
									class="variant-ringed-surface btn w-full text-black sm:w-auto"
									aria-label={m.signin_forgottenpassword()}
									tabindex={forgotPasswordTabIndex}
									onclick={handleForgotPassword}
								>
									{m.signin_forgottenpassword()}
								</button>
							</div>
						</div>
					{/if}

					<!-- Two-Factor Authentication -->
					{#if requires2FA && !PWforgot && !PWreset}
						<div class="flex w-full flex-col gap-4">
							<!-- 2FA Header -->
							<div class="text-center">
								<div class="mb-3">
									<iconify-icon icon="mdi:shield-key" width="48" class="mx-auto text-primary-500"></iconify-icon>
								</div>
								<h3 class="h3 mb-2">{m.twofa_verify_title()}</h3>
								<p class="text-sm text-surface-600 dark:text-surface-300">
									{useBackupCode ? 'Enter your backup recovery code:' : m.twofa_verify_description()}
								</p>
							</div>

							<!-- Code Input -->
							<div class="flex flex-col gap-3">
								<div class="relative">
									<input
										type="text"
										bind:value={twoFACode}
										oninput={handle2FAInput}
										onkeydown={(e) => e.key === 'Enter' && verify2FA()}
										placeholder={useBackupCode ? 'Enter backup code' : m.twofa_code_placeholder()}
										class="input text-center font-mono tracking-wider"
										class:text-2xl={!useBackupCode}
										class:text-lg={useBackupCode}
										maxlength={useBackupCode ? '10' : '6'}
										autocomplete="off"
									/>

									<!-- Character counter for backup codes -->
									{#if useBackupCode}
										<div class="mt-1 text-center text-xs text-surface-500">
											{twoFACode.length}/10
										</div>
									{/if}
								</div>

								<!-- Toggle Code Type -->
								<div class="text-center">
									<button type="button" onclick={toggle2FACodeType} class="text-sm text-primary-500 underline hover:text-primary-600">
										{useBackupCode ? m.twofa_use_authenticator() : m.twofa_use_backup_code()}
									</button>
								</div>

								<!-- Action Buttons -->
								<div class="flex gap-3">
									<button type="button" onclick={back2FAToLogin} class="variant-soft-surface btn flex-1">
										<iconify-icon icon="mdi:arrow-left" width="20" class="mr-2"></iconify-icon>
										{m.button_back()}
									</button>

									<button
										type="button"
										onclick={verify2FA}
										disabled={!twoFACode.trim() ||
											isVerifying2FA ||
											(!useBackupCode && twoFACode.length !== 6) ||
											(useBackupCode && twoFACode.length < 8)}
										class="variant-filled-primary btn flex-1"
									>
										{#if isVerifying2FA}
											<img src="/Spinner.svg" alt="Loading.." class="mr-2 h-5 invert filter" />
											{m.twofa_verifying()}
										{:else}
											<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
											{m.twofa_verify_button()}
										{/if}
									</button>
								</div>

								<!-- Help Text -->
								<div class="mt-2 text-center">
									<div class="text-xs text-surface-500">
										{#if !useBackupCode}
											<p>Enter the 6-digit code from your authenticator app</p>
										{:else}
											<p>Enter one of your 8-character backup codes</p>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- Forgotten Password -->
					{#if PWforgot && !PWreset}
						<form
							method="POST"
							action="?/forgotPW"
							use:forgotEnhance
							bind:this={formElement}
							class="flex w-full flex-col gap-3"
							class:hide={active !== 0}
							inert={active !== 0}
						>
							<!-- Email field -->
							<FloatingInput
								id="emailforgot"
								name="email"
								type="email"
								tabindex={emailTabIndex}
								autocomplete="email"
								autocapitalize="none"
								spellcheck={false}
								bind:value={$forgotForm.email}
								label={m.form_emailaddress()}
								{...$forgotConstraints.email}
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
									<!-- Optimized loading indicators -->
									{#if isSubmitting}
										<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter" />
									{/if}
								</button>

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
							method="POST"
							action="?/resetPW"
							use:resetEnhance
							bind:this={formElement}
							class="flex w-full flex-col gap-3"
							class:hide={active !== 0}
							inert={active !== 0}
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
								{...$resetConstraints.password}
								{showPassword}
								autocomplete="new-password"
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
								{showPassword}
								autocomplete="new-password"
								label={m.form_confirmpassword()}
								icon="mdi:lock"
								iconColor="black"
								textColor="black"
							/>

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
									<!-- Optimized loading indicators -->
									{#if isSubmitting}
										<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6" />
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
						<p class="font-bold text-error-500">{m.signin_no_user()}</p>
						<p>
							{m.signin_signup_first_admin()}
						</p>
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<SigninIcon show={active === 1 || active === undefined} onClick={handleFormClick} />
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
		from {
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
