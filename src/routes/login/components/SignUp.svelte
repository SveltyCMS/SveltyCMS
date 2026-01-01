<!--
@file src/routes/login/components/SignUp.svelte
@component
**SignUP with optional OAuth support**

### Props
- `active`: boolean
- `isInviteFlow`: boolean
- `token`: string
- `invitedEmail`: string
- `inviteError`: string
- `onClick`: () => void
- `onPointerEnter`: () => void
- `onBack`: () => void
- `firstCollectionPath`: string

### Features:
 - Dynamic language selection with a debounced input field or dropdown for multiple languages
 - Demo mode support with auto-reset timer 
 - Initial form display adapts based on environment variables (`SEASON`, `DEMO`, and `firstUserExists`)
 - Reset state functionality for easy return to initial screen
 - Accessibility features for language selection and form navigation
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { preloadData } from '$app/navigation';

	import type { PageData } from '../$types';

	// Stores
	import { page } from '$app/state';

	import { Form } from '@utils/Form.svelte';
	import { signUpFormSchema } from '@utils/formSchemas';
	// Components
	import PasswordStrength from '@components/PasswordStrength.svelte';
	import SiteName from '@components/SiteName.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import SignupIcon from './icons/SignupIcon.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Screen size store
	import { isDesktop } from '@stores/screenSizeStore.svelte';
	import type { Component } from 'svelte';

	// Props
	const {
		active = $bindable(undefined),
		isInviteFlow = false,
		token = '',
		invitedEmail = '',
		inviteError = '',
		onClick = () => {},
		onPointerEnter = () => {},
		onBack = () => {},
		firstCollectionPath = ''
	} = $props();

	const pageData = page.data as PageData;
	const firstUserExists = pageData.firstUserExists;
	const showOAuth = pageData.showOAuth;
	const hasExistingOAuthUsers = pageData.hasExistingOAuthUsers;

	// State management
	const tabIndex = $state(1);
	let response = $state(undefined);
	let formElement: HTMLFormElement | null = $state(null);
	let showPassword = $state(false);
	let isSubmitting = $state(false);
	let isRedirecting = $state(false);
	let FloatingPathsComponent: Component | null = $state(null);

	// Pre-calculate tab indices
	const usernameTabIndex = 1;
	const emailTabIndex = 2;
	const passwordTabIndex = 3;
	const confirmPasswordTabIndex = 4;
	const tokenTabIndex = 5;

	// Form setup
	// Form setup
	const signUpForm = new Form({ username: '', email: '', password: '', confirm_password: '', token: '' }, signUpFormSchema);

	const signUpSubmit = signUpForm.enhance({
		onSubmit: ({ cancel }) => {
			if (Object.keys(signUpForm.errors).length > 0) {
				cancel();
				return;
			}
			isSubmitting = true;
		},

		onResult: async ({ result, update }) => {
			isSubmitting = false;

			if (result.type === 'redirect') {
				isRedirecting = true;
				setTimeout(() => {
					isRedirecting = false;
				}, 100);
				return;
			}

			isRedirecting = false;

			if (result.type === 'failure' || result.type === 'error') {
				formElement?.classList.add('wiggle');
				setTimeout(() => {
					formElement?.classList.remove('wiggle');
				}, 300);
			}

			if (result.type === 'success') {
				response = result.data?.message;
			}

			await update();
		}
	});

	// Reactive form values for easier access
	const currentFormToken = $derived(signUpForm.data.token);

	// URL parameter handling - update params when URL changes
	const params = $derived(browser ? new URL(window.location.href).searchParams : new URLSearchParams(''));

	// Initialize form with invite data when in invite flow
	$effect(() => {
		if (isInviteFlow && invitedEmail && signUpForm.data.email !== invitedEmail) {
			signUpForm.data.email = invitedEmail;
		}
		if (isInviteFlow && token && signUpForm.data.token !== token) {
			signUpForm.data.token = token;
		}
		// Handle URL parameters for invite tokens (both new and legacy formats)
		if (browser && !isInviteFlow) {
			const inviteToken = params.get('invite_token') || params.get('regToken');
			if (inviteToken && inviteToken !== signUpForm.data.token) {
				signUpForm.data.token = inviteToken;
			}
		}
		// Also check if the form was pre-filled by the server (invalid token case)
		if (browser && signUpForm.data.token && !isInviteFlow) {
			logger.debug('Form token pre-filled by server:', signUpForm.data.token);
		}
	});

	// Event handlers
	function handleOAuth() {
		// Check if user needs an invitation token
		// All users now require invite tokens (first user goes through /setup)
		if (!isInviteFlow && !hasExistingOAuthUsers && !currentFormToken) {
			// Show a helpful message
			alert(
				'⚠️ Please enter your invitation token first before using Google OAuth signup. OAuth registration requires an invitation from an administrator.'
			);
			return;
		}

		const form = document.createElement('form');
		form.method = 'post';

		// Use signInOAuth action when in invite flow to preserve invite token
		if (isInviteFlow && token) {
			// Build the action URL with the invite token as a query parameter
			form.action = `?/signInOAuth&invite_token=${encodeURIComponent(token)}`;
		} else if (currentFormToken) {
			// User has entered a token in the form, pass it along
			form.action = `?/signInOAuth&invite_token=${encodeURIComponent(currentFormToken)}`;
		} else {
			form.action = '?/signInOAuth';
		}

		document.body.appendChild(form);
		form.submit();
		document.body.removeChild(form);
		setTimeout(() => {}, 300);
	}

	function handleBack(event: Event) {
		event.stopPropagation();
		onBack();
	}

	function handlePointerEnter() {
		onPointerEnter();
	}

	function handleFormClick(event: Event) {
		event.stopPropagation();
		onClick();
	}

	// Class computations
	const isActive = $derived(active === 1);
	const isInactive = $derived(active !== undefined && active !== 1);
	const isHover = $derived(active === undefined || active === 0);

	const baseClasses = 'hover relative flex items-center overflow-y-auto';

	// Lazy-load FloatingPaths only on desktop when SignUp is active
	$effect(() => {
		const desktop = isDesktop.value;
		const isActiveSignUp = active === 1;
		if (browser && desktop && isActiveSignUp) {
			import('@root/src/components/system/FloatingPaths.svelte').then((m) => {
				FloatingPathsComponent = m.default as Component;
			});
		} else {
			FloatingPathsComponent = null;
		}
	});

	// Prefetch first collection data when active
	$effect(() => {
		if (active === 1 && firstCollectionPath) {
			preloadData(firstCollectionPath);
		}
	});
</script>

<section
	onclick={handleFormClick}
	onkeydown={(e) => e.key === 'Enter' && onClick?.()}
	onpointerenter={handlePointerEnter}
	role="button"
	tabindex={tabIndex}
	class={baseClasses}
	class:active={isActive}
	class:inactive={isInactive}
	class:hover={isHover}
>
	{#if active === 1}
		<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
			{#if isDesktop.value && FloatingPathsComponent}
				<div class="absolute inset-0">
					<FloatingPathsComponent position={1} background="dark" mirrorAnimation />
					<FloatingPathsComponent position={-1} background="dark" mirrorAnimation />
				</div>
			{/if}
			<!-- CSS Logo -->
			<div class="absolute left-1/2 top-[20%] hidden -translate-x-1/2 -translate-y-1/2 transform xl:block">
				<SveltyCMSLogoFull />
			</div>
			<div class="relative z-10 mx-auto mb-[5%] mt-[15%] w-full rounded-md bg-[#242728] p-4 lg:w-4/5" class:hide={active !== 1}>
				<div class="mb-4 flex flex-row gap-2">
					<SveltyCMSLogo className="w-14" fill="red" />

					<h1 class="text-3xl font-bold text-white lg:text-4xl">
						<div class="text-xs text-surface-200"><SiteName highlight="CMS" /></div>
						<div class="wrap-break-word lg:-mt-1">
							{#if isInviteFlow}
								{m.form_signup()}
								<span class="text-2xl text-primary-500 sm:text-3xl">: Complete Invitation</span>
							{:else}
								{m.form_signup()}
								<span class="text-2xl capitalize text-primary-500 sm:text-3xl">: New User</span>
							{/if}
						</div>
					</h1>
				</div>

				<!-- Required with Back button -->
				<div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500">
					{m.form_required()}

					<button onclick={handleBack} aria-label="Back" class="btn-icon rounded-full preset-outlined-secondary-500">
						<iconify-icon icon="ri:arrow-left-line" width="20" class="text-white"></iconify-icon>
					</button>
				</div>

				<!-- <SuperDebug data={$form} display={dev} /> -->
				<form
					method="post"
					action="?/signUp"
					use:enhance={signUpSubmit}
					bind:this={formElement}
					class="items flex flex-col gap-3"
					class:hide={active !== 1}
					inert={active !== 1}
				>
					<!-- Username field -->
					<FloatingInput
						id="usernamesignUp"
						name="username"
						type="text"
						tabindex={usernameTabIndex}
						required
						bind:value={signUpForm.data.username}
						label={m.username()}
						minlength={2}
						maxlength={24}
						icon="mdi:user-circle"
						iconColor="white"
						textColor="white"
						inputClass="text-white"
						autocomplete="username"
					/>
					{#if signUpForm.errors.username}<span class="text-xs text-error-500">{signUpForm.errors.username[0]}</span>{/if}

					<!-- Email field -->
					<FloatingInput
						id="emailsignUp"
						name="email"
						type="email"
						tabindex={emailTabIndex}
						required
						autocomplete="email"
						autocapitalize="none"
						spellcheck={false}
						bind:value={signUpForm.data.email}
						label={m.email()}
						minlength={5}
						maxlength={50}
						icon="mdi:email"
						iconColor="white"
						textColor="white"
						inputClass="text-white {isInviteFlow ? 'opacity-70' : ''}"
						disabled={isInviteFlow}
					/>
					{#if signUpForm.errors.email}<span class="text-xs text-error-500">{signUpForm.errors.email[0]}</span>{/if}
					{#if isInviteFlow}<span class="text-xs text-primary-400">✓ Email pre-filled from invitation</span>{/if}

					<!-- Hidden email input to ensure form submission when disabled -->
					{#if isInviteFlow}
						<input type="hidden" name="email" value={signUpForm.data.email} />
					{/if}

					<!-- Password field -->
					<FloatingInput
						id="passwordsignUp"
						name="password"
						type="password"
						tabindex={passwordTabIndex}
						required
						bind:value={signUpForm.data.password}
						bind:showPassword
						label={m.form_password()}
						minlength={8}
						maxlength={50}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						passwordIconColor="white"
						inputClass="text-white"
						autocomplete="new-password"
					/>
					{#if signUpForm.errors.password}
						<span class="text-xs text-error-500">{signUpForm.errors.password[0]}</span>
					{/if}

					<!-- Password Confirm -->
					<FloatingInput
						id="confirm_passwordsignUp"
						name="confirm_password"
						type="password"
						tabindex={confirmPasswordTabIndex}
						required
						bind:value={signUpForm.data.confirm_password}
						bind:showPassword
						label={m.confirm_password?.() || m.form_confirmpassword?.()}
						minlength={8}
						maxlength={50}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						passwordIconColor="white"
						inputClass="text-white"
						autocomplete="new-password"
					/>
					{#if signUpForm.errors.confirm_password}
						<span class="text-xs text-error-500">{signUpForm.errors.confirm_password[0]}</span>
					{/if}
					<!-- Password Strength Indicator -->
					<PasswordStrength password={signUpForm.data.password} confirmPassword={signUpForm.data.confirm_password} />

					{#if !isInviteFlow}
						<!-- Registration Token (hidden when using invite flow, always required now since first user uses /setup) -->
						<FloatingInput
							id="tokensignUp"
							name="token"
							type="password"
							tabindex={tokenTabIndex}
							required
							bind:value={signUpForm.data.token}
							label={m.registration_token?.() || m.signup_registrationtoken?.()}
							minlength={36}
							maxlength={36}
							icon="mdi:key-chain"
							iconColor="white"
							textColor="white"
							passwordIconColor="white"
							inputClass="text-white"
							autocomplete="one-time-code"
						/>
						{#if signUpForm.errors.token}
							<span class="text-xs text-error-500">{signUpForm.errors.token[0]}</span>
						{/if}
						{#if signUpForm.data.token && inviteError}
							<span class="text-xs text-warning-400">⚠️ Token was pre-filled from URL and will be validated against the server</span>
						{/if}
					{:else if isInviteFlow}
						<!-- Hidden token field for invite flow -->
						<input type="hidden" name="token" value={token} />
						<span class="text-xs text-primary-400">✓ Using invitation token</span>
					{/if}

					{#if response}
						<span class="text-xs text-error-500">{response}</span>
					{/if}

					{#if inviteError && !signUpForm.data.token}
						<span class="text-xs text-error-500">{inviteError}</span>
					{/if}

					{#if !showOAuth}
						<!-- Email SignIn only -->
						<button type="submit" class="btn bg-white text-black mt-4 uppercase" aria-label={isInviteFlow ? 'Accept Invitation' : m.form_signup()}>
							{isInviteFlow ? 'Accept Invitation & Create Account' : m.form_signup()}
							{#if isSubmitting || isRedirecting}<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6" />{/if}
						</button>

						<!-- Email + OAuth signin  -->
					{:else}
						<div class="btn-group mt-4 border border-secondary-500 text-white [&>*+*]:border-secondary-500">
							<button
								type="submit"
								class="btn w-3/4 rounded-none bg-surface-200 text-black hover:text-white"
								aria-label={isInviteFlow ? 'Accept Invitation' : m.form_signup()}
							>
								<span class="w-full text-black hover:text-white">
									{isInviteFlow ? 'Accept Invitation' : m.form_signup()}
								</span>
								<!-- Loading indicators -->
								{#if isSubmitting || isRedirecting}<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6" />{/if}
							</button>

							<button type="button" onclick={handleOAuth} aria-label="OAuth" class="btn flex w-1/4 items-center justify-center">
								<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-0.5 sm:mr-2"></iconify-icon>
								<span class="">OAuth</span>
							</button>
						</div>

						{#if !isInviteFlow && firstUserExists && !hasExistingOAuthUsers}
							<p class="mt-2 text-xs text-surface-400">
								💡 Note: Both email/password and Google OAuth registration require an invitation token from an administrator.
							</p>
						{:else if !isInviteFlow && hasExistingOAuthUsers}
							<p class="mt-2 text-xs text-surface-400">💡 Note: New user registration requires an invitation token from an administrator.</p>
						{/if}
					{/if}
				</form>
			</div>
		</div>
	{/if}

	<SignupIcon show={active === 0 || active === undefined} onClick={handleFormClick} />
</section>

<style>
	.hide {
		transition: 0s;
		opacity: 0;
	}
	section {
		--width: 0%;
		background: #242728;
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
		border-top-left-radius: 5% 50%;
		border-bottom-left-radius: 5% 50%;
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
