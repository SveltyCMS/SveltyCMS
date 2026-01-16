<!-- 
@file src/routes/login/components/SignIn.svelte
@component
**SignIn component with OAuth support**

### Props
- `active`: number
- `onClick`: () => void
- `onPointerEnter`: () => void
- `onBack`: () => void
- `firstCollectionPath`: string

### Features:
 - User authentication with password or OAuth
 - Dynamic language selection with debounced input field or dropdown for multiple languages
 - Demo mode support with auto-reset timer displayed when active
 - Initial form display adapts based on environment variables (`SEASON`, `DEMO`)
 - Password reset functionality
 - Two-factor authentication (2FA) support
 - Accessibility features for language selection and form navigation

Note: First-user registration is now handled by /setup route (enforced by handleSetup hook)
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, preloadData } from '$app/navigation';
	import { enhance } from '$app/forms';

	// Stores
	import { page } from '$app/state';
	import type { PageData } from '../$types';

	import { Form } from '@utils/Form.svelte';
	import { loginFormSchema, forgotFormSchema, resetFormSchema } from '@utils/formSchemas';

	// Components
	import SiteName from '@components/SiteName.svelte';
	import SigninIcon from './icons/SigninIcon.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import PasswordStrength from '@components/PasswordStrength.svelte';
	// Lazy-load FloatingPaths on desktop for performance
	let FloatingPathsComponent: Component | null = $state(null);

	// Skeleton
	import { toaster } from '@stores/store.svelte';
	import type { Component } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import OauthLogin from './OauthLogin.svelte';

	// Screen size store
	import { isDesktop } from '@stores/screenSizeStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Props
	const {
		active = $bindable(undefined),
		onClick = () => {},
		onPointerEnter: onPointerEnterProp = () => {},
		onBack = () => {},
		firstCollectionPath = ''
	}: {
		active?: number;
		onClick?: () => void;
		onPointerEnter?: (e: PointerEvent) => void;
		onBack?: () => void;
		firstCollectionPath?: string;
	} = $props();

	// State management
	let PWforgot = $state(false);
	let PWreset = $state(false);
	const showPassword = $state(false);
	let formElement: HTMLFormElement | null = $state(null);
	const tabIndex = $state(1);

	// Pre-calculate tab indices
	const emailTabIndex = 1;
	const passwordTabIndex = 2;
	const confirmPasswordTabIndex = 3;
	const forgotPasswordTabIndex = 4;
	const pageData = page.data as PageData;

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
	// Login form setup
	const loginForm = new Form({ email: '', password: '', isToken: false }, loginFormSchema);
	const loginSubmit = loginForm.enhance({
		onSubmit: ({ cancel }) => {
			if (loginForm.data.email) {
				loginForm.data.email = loginForm.data.email.toLowerCase();
			}

			// handle login form submission
			if (Object.keys(loginForm.errors).length > 0) {
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

		onResult: async ({ result, update }) => {
			// Reset submitting state
			isSubmitting = false;

			if (result.type === 'redirect') {
				// Keep authenticating state for redirect phase
				isAuthenticating = true;

				// Trigger the toast
				toaster.success({ description: m.signin_signinsuccess() });

				// Cancel default redirect behavior so we can use client-side navigation
				// cancel(); // Form class doesn't support cancelling redirect in onResult easily without preventing update?
				// Actually, if we don't call update(), the redirect doesn't happen automatically?
				// SvelteKit default applyAction handles redirect.
				// We want to use goto.

				// Use client-side navigation for instant redirect
				if (result.location) {
					goto(result.location);
				}

				// Clear authenticating state immediately
				isAuthenticating = false;
				globalLoadingStore.stopLoading(loadingOperations.authentication);

				return;
			}

			// Check if 2FA is required
			if (result.type === 'failure' && result.data?.requires2FA) {
				requires2FA = true;
				twoFAUserId = result.data.userId || '';
				isAuthenticating = false;
				globalLoadingStore.stopLoading(loadingOperations.authentication);

				// Show 2FA required message
				toaster.warning({ description: m.twofa_verify_title() });
				return;
			}

			// Reset all states on error
			isAuthenticating = false;
			globalLoadingStore.stopLoading(loadingOperations.authentication);

			if (result.type === 'failure' || result.type === 'error') {
				// Trigger the toast
				toaster.error({ description: m.signin_wrong_user_or_password() });

				// add wiggle animation to form element
				formElement?.classList.add('wiggle');
				setTimeout(() => {
					formElement?.classList.remove('wiggle');
				}, 300);
			}

			await update();
		}
	});

	// Forgot Form setup
	// Forgot Form setup
	const forgotForm = new Form({ email: '' }, forgotFormSchema);
	const forgotSubmit = forgotForm.enhance({
		onSubmit: ({ cancel }) => {
			if (forgotForm.data.email) {
				forgotForm.data.email = forgotForm.data.email.toLowerCase();
			}

			if (Object.keys(forgotForm.errors).length > 0) {
				cancel();
				formElement?.classList.add('wiggle');
				setTimeout(() => formElement?.classList.remove('wiggle'), 300);
				return;
			}

			isSubmitting = true;
		},

		onResult: async ({ result, update }) => {
			isSubmitting = false;

			if (result.type === 'error') {
				// Transform the array of error messages into a single string
				// Form class puts errors in forgotForm.errors
				// But result.type 'error' is usually 500 or network error
				// If it's 400 with errors, it's 'failure'

				// For now, just show generic error or message from result
				toaster.info({ description: result.error?.message || 'An error occurred' });
				return;
			}

			if (result.type === 'success' || result.type === 'failure') {
				// Failure can also contain data
				// Check if user exists
				if (result.data && result.data.userExists === false) {
					PWreset = false;
					toaster.error({ description: 'No account found with this email address.' });
					formElement?.classList.add('wiggle');
					setTimeout(() => formElement?.classList.remove('wiggle'), 300);
					return;
				} else if (result.data && result.data.userExists === true) {
					PWreset = true;
					toaster.success({ description: m.signin_forgottontoast() });
					return;
				} else {
					// Fallback
					if (result.data?.status === false) {
						PWreset = false;
						formElement?.classList.add('wiggle');
						setTimeout(() => formElement?.classList.remove('wiggle'), 300);
					} else {
						PWreset = true;
						toaster.success({ description: m.signin_forgottontoast() });
					}
				}
			}

			await update();

			if (result.type === 'failure') {
				formElement?.classList.add('wiggle');
				setTimeout(() => {
					formElement?.classList.remove('wiggle');
				}, 300);
			}
		}
	});

	// Reset Form setup
	// Reset Form setup
	const resetForm = new Form({ password: '', confirm_password: '', token: '', email: '' }, resetFormSchema);
	const resetSubmit = resetForm.enhance({
		onSubmit: ({ cancel }) => {
			if (Object.keys(resetForm.errors).length > 0) {
				cancel();
				return;
			}
			isSubmitting = true;
		},

		onResult: async ({ result, update }) => {
			isSubmitting = false;
			PWreset = false;
			PWforgot = false;

			if (result.type === 'success' || result.type === 'redirect') {
				toaster.success({ description: m.signin_restpasswordtoast() });
				if (result.type === 'redirect') {
					if (result.location) goto(result.location);
					return;
				}
			}

			await update();

			if (result.type === 'failure') {
				formElement?.classList.add('wiggle');
				setTimeout(() => {
					formElement?.classList.remove('wiggle');
				}, 300);
			}
		}
	});

	// 2FA Functions
	async function verify2FA() {
		if (!twoFACode.trim() || isVerifying2FA) return;

		if (!useBackupCode && twoFACode.length !== 6) {
			toaster.error({ description: m.twofa_error_invalid_code() });
			return;
		}

		if (useBackupCode && twoFACode.length < 8) {
			toaster.error({ description: 'Invalid backup code format' });
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
				toaster.success({ description: m.twofa_success_verified() });

				// The server will redirect on successful verification
				window.location.reload();
			} else {
				const errorData = await response.json();
				throw new Error(errorData.message || m.twofa_error_invalid_code());
			}
		} catch (error) {
			toaster.error({ description: error instanceof Error ? error.message : m.twofa_error_invalid_code() });
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
				resetForm.data.token = tokenParam;
				resetForm.data.email = emailParam;

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
				FloatingPathsComponent = m.default as Component;
			});
		} else {
			FloatingPathsComponent = null;
		}
	});

	// Prefetch first collection data when active
	$effect(() => {
		if (active === 0 && firstCollectionPath) {
			preloadData(firstCollectionPath);
		}
	});
</script>

<section
	onclick={handleFormClick}
	onkeydown={(e) => e.key === 'Enter' && onClick?.()}
	onpointerenter={onPointerEnterProp}
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
						<div class="text-xs text-surface-300"><SiteName highlight="CMS" /></div>
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

					<button onclick={handleBack} aria-label="Back" class="btn-icon preset-outlined-secondary-500 rounded-full">
						<iconify-icon icon="ri:arrow-right-line" width="20" class="text-black"></iconify-icon>
					</button>
				</div>

				<!-- Sign In (first-user signup now handled by /setup) -->
				{#if !PWforgot && !PWreset}
					<form
						id="signin-form"
						method="POST"
						action="?/signIn"
						use:enhance={loginSubmit}
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
							bind:value={loginForm.data.email}
							label={m.email()}
							required
							icon="mdi:email"
						/>
						{#if loginForm.errors.email}<span class="invalid text-xs text-error-500">{loginForm.errors.email[0]}</span>{/if}

						<!-- Password field -->
						<FloatingInput
							id="passwordsignIn"
							name="password"
							type="password"
							autocomplete="current-password"
							tabindex={passwordTabIndex}
							bind:value={loginForm.data.password}
							required
							{showPassword}
							label={m.form_password()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
						/>
						{#if loginForm.errors.password}<span class="invalid text-xs text-error-500">{loginForm.errors.password[0]}</span>{/if}
					</form>

					<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
						<!-- Row 1 -->
						<div class="flex w-full justify-between gap-2 sm:w-auto">
							<button type="submit" form="signin-form" class="preset-filled-surface-500 btn w-full text-white sm:w-auto" aria-label={m.form_signin()}>
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
								class="btn preset-outlined-surface-500 w-full text-black sm:w-auto"
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
									maxlength={useBackupCode ? 10 : 6}
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
								<button
									type="button"
									onclick={toggle2FACodeType}
									class="text-sm text-primary-500 underline hover:text-primary-600"
									aria-label={useBackupCode ? m.twofa_use_authenticator() : m.twofa_use_backup_code()}
								>
									{useBackupCode ? m.twofa_use_authenticator() : m.twofa_use_backup_code()}
								</button>
							</div>

							<!-- Action Buttons -->
							<div class="flex gap-3">
								<button type="button" onclick={back2FAToLogin} class="btn preset-soft-surface-500 flex-1" aria-label={m.button_back()}>
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
									class="btn preset-filled-primary-500 flex-1"
									aria-label={m.twofa_verify_button()}
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
						use:enhance={forgotSubmit}
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
							bind:value={forgotForm.data.email}
							label={m.email()}
							required
							icon="mdi:email"
						/>
						{#if forgotForm.errors.email}
							<span class="invalid text-xs text-error-500">
								{forgotForm.errors.email[0]}
							</span>
						{/if}

						{#if Object.keys(forgotForm.errors).length > 0 && !forgotForm.errors.email}
							<span class="invalid text-xs text-error-500">
								{Object.values(forgotForm.errors).flat().join(', ')}
							</span>
						{/if}

						<div class="mt-4 flex items-center justify-between">
							<button type="submit" class="preset-filled-surface-500 text-white btn" aria-label={m.form_resetpassword()}>
								{m.form_resetpassword()}
								<!-- Optimized loading indicators -->
								{#if isSubmitting}
									<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter" />
								{/if}
							</button>

							<!-- Back button  -->
							<button
								type="button"
								class="btn-icon preset-filled-surface-500 rounded-full"
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
						use:enhance={resetSubmit}
						bind:this={formElement}
						class="flex w-full flex-col gap-3"
						class:hide={active !== 0}
						inert={active !== 0}
					>
						<!-- Hidden fields -->
						<input type="hidden" name="email" bind:value={resetForm.data.email} />
						<input type="hidden" name="token" bind:value={resetForm.data.token} />

						<!-- Password field -->
						<FloatingInput
							id="passwordreset"
							name="password"
							type="password"
							tabindex={passwordTabIndex}
							bind:value={resetForm.data.password}
							required
							{showPassword}
							autocomplete="new-password"
							label={m.form_password()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
						/>
						{#if resetForm.errors.password}
							<span class="invalid text-xs text-error-500">
								{resetForm.errors.password[0]}
							</span>
						{/if}

						<!-- Confirm Password field -->
						<FloatingInput
							id="confirm_passwordreset"
							name="confirm_password"
							type="password"
							tabindex={confirmPasswordTabIndex}
							bind:value={resetForm.data.confirm_password}
							{showPassword}
							autocomplete="new-password"
							label={m.confirm_password?.() || m.form_confirmpassword?.()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
						/>

						<!-- Password Strength Indicator -->
						<PasswordStrength password={resetForm.data.password} confirmPassword={resetForm.data.confirm_password} />
						<!-- Registration Token -->
						<FloatingInput
							id="tokenresetPW"
							name="token"
							type="password"
							bind:value={resetForm.data.token}
							{showPassword}
							label={m.registration_token?.() || m.signin_registrationtoken?.()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
							required
						/>

						{#if resetForm.errors.token}
							<span class="invalid text-xs text-error-500">
								{resetForm.errors.token[0]}
							</span>
						{/if}

						{#if Object.keys(resetForm.errors).length > 0 && !resetForm.errors.token}
							<span class="invalid text-xs text-error-500">
								{Object.values(resetForm.errors).flat().join(', ')}
							</span>
						{/if}

						<input type="email" name="email" bind:value={resetForm.data.email} hidden />

						<div class="mt-4 flex items-center justify-between">
							<button type="submit" aria-label={m.signin_savenewpassword()} class="btn preset-filled-surface-500 ml-2 mt-6 text-white">
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
								class="preset-filled-surface-500 btn-icon"
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
			</div>
		</div>
	{/if}

	<SigninIcon show={active === 1 || active === undefined} onClick={handleFormClick} />
</section>

<style>
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
