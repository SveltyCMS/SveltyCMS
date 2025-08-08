<!-- 
@file src/routes/login/components/SignUp.svelte
@component
**SignUp component with optional OAuth support**

Features:
 - Dynamic language selection with a debounced input field or dropdown for multiple languages
 - Demo mode support with auto-reset timer displayed when active
 - Initial form display adapts based on environment variables (`SEASON`, `DEMO`, and `firstUserExists`)
 - Reset state functionality for easy return to initial screen
 - Accessibility features for language selection and form navigation
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { privateEnv } from '@root/config/private';

	import type { PageData } from '../$types';

	// Stores
	import { page } from '$app/state';

	// Superforms
	// import SuperDebug from 'sveltekit-superforms/client/SuperDebug.svelte';
	import type { SignUpFormSchema } from '@utils/formSchemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	// Components
	import PasswordStrength from '@components/PasswordStrength.svelte';
	import SiteName from '@components/SiteName.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	// Lazy-load FloatingPaths for performance on desktop
	let FloatingPathsComponent = $state<any>(null);
	import SignupIcon from './icons/SignupIcon.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Screen size store
	import { isDesktop } from '@stores/screenSizeStore.svelte';

	// Props
	const {
		active = $bindable(undefined),
		FormSchemaSignUp,
		isInviteFlow = false,
		token = '',
		invitedEmail = '',
		inviteError = '',
		onClick = () => {},
		onPointerEnter = () => {},
		onBack = () => {}
	} = $props<{
		active?: undefined | 0 | 1;
		FormSchemaSignUp: SuperValidated<SignUpFormSchema>;
		isInviteFlow?: boolean;
		token?: string;
		invitedEmail?: string;
		inviteError?: string;
		onClick?: () => void;
		onPointerEnter?: () => void;
		onBack?: () => void;
	}>();

	const pageData = page.data as PageData;
	const firstUserExists = pageData.firstUserExists;
	const showOAuth = pageData.showOAuth;
	const hasExistingOAuthUsers = pageData.hasExistingOAuthUsers;

	// State management
	let tabIndex = $state(1);
	let response = $state<any>(undefined);
	let formElement = $state<HTMLFormElement | null>(null);
	let showPassword = $state(false);
	let isSubmitting = $state(false);
	let isRedirecting = $state(false);

	// Pre-calculate tab indices
	const usernameTabIndex = 1;
	const emailTabIndex = 2;
	const passwordTabIndex = 3;
	const confirmPasswordTabIndex = 4;
	const tokenTabIndex = 5;

	// Form setup
	const { form, constraints, allErrors, errors, enhance } = superForm(FormSchemaSignUp, {
		id: 'signup',
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		applyAction: true,
		taintedMessage: '', // prevent multiple submits
		multipleSubmits: 'prevent', // prevent multiple submits

		onSubmit: ({ cancel }) => {
			if ($allErrors.length > 0) {
				cancel();
				return;
			}

			// Set submitting state for better UX
			isSubmitting = true;
		},

		onResult: ({ result, cancel }) => {
			// Reset submitting state
			isSubmitting = false;

			if (result.type == 'redirect') {
				// Set redirecting state for brief period
				isRedirecting = true;

				// Clear redirecting state after brief delay to allow redirect
				setTimeout(() => {
					isRedirecting = false;
				}, 1000);

				return;
			}

			// Reset redirecting state on non-redirect
			isRedirecting = false;
			cancel();

			// add wiggle animation to form element
			formElement?.classList.add('wiggle');
			setTimeout(() => {
				formElement?.classList.remove('wiggle');
			}, 300);

			if (result.type == 'success') {
				response = result.data?.message;
			}
		}
	});

	// Reactive form values for easier access
	const currentFormToken = $derived($form.token);

	// URL parameter handling - update params when URL changes
	const params = $derived(browser ? new URL(window.location.href).searchParams : new URLSearchParams(''));

	// Initialize form with invite data when in invite flow
	$effect(() => {
		if (isInviteFlow && invitedEmail && $form.email !== invitedEmail) {
			$form.email = invitedEmail;
		}
		if (isInviteFlow && token && $form.token !== token) {
			$form.token = token;
		}
		// Handle URL parameters for invite tokens (both new and legacy formats)
		if (browser && !isInviteFlow) {
			const inviteToken = params.get('invite_token') || params.get('regToken');
			if (inviteToken && inviteToken !== $form.token) {
				console.log('Setting invite token from URL:', inviteToken);
				$form.token = inviteToken;
			}
		}
		// Also check if the form was pre-filled by the server (invalid token case)
		if (browser && $form.token && !isInviteFlow) {
			console.log('Form token pre-filled by server:', $form.token);
		}
	});

	// Event handlers
	function handleOAuth() {
		// Check if user needs an invitation token
		// First user (!firstUserExists) should NOT require a token
		// Only existing users (firstUserExists) without an invite flow or token should be blocked
		if (!isInviteFlow && firstUserExists && !hasExistingOAuthUsers && !currentFormToken) {
			// Show a helpful message
			alert(
				'⚠️ Please enter your invitation token first before using Google OAuth signup. Both email/password and OAuth registration require an invitation from an administrator.'
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
						<div class="text-xs text-surface-300"><SiteName /></div>
						<div class="break-words lg:-mt-1">
							{#if isInviteFlow}
								{m.form_signup()}
								<span class="text-2xl text-primary-500 sm:text-3xl">: Complete Invitation</span>
							{:else}
								{m.form_signup()}
								{#if !firstUserExists}
									<span class="text-2xl text-primary-500 sm:text-3xl">: Admin</span>
								{:else}
									<span class="text-2xl capitalize text-primary-500 sm:text-3xl">: New User</span>
								{/if}
							{/if}
						</div>
					</h1>
				</div>

				<!-- Required with Back button -->
				<div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500">
					{m.form_required()}

					<button onclick={handleBack} aria-label="Back" class="variant-outline-secondary btn-icon">
						<iconify-icon icon="ri:arrow-left-line" width="20" class="text-white"></iconify-icon>
					</button>
				</div>

				<!-- <SuperDebug data={$form} display={dev} /> -->
				<form
					method="post"
					action="?/signUp"
					use:enhance
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
						bind:value={$form.username}
						label={m.form_username()}
						{...$constraints.username}
						icon="mdi:user-circle"
						iconColor="white"
						textColor="white"
						inputClass="text-white"
						autocomplete="username"
					/>
					{#if $errors.username}<span class="text-xs text-error-500">{$errors.username}</span>{/if}

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
						bind:value={$form.email}
						label={m.form_emailaddress()}
						{...$constraints.email}
						icon="mdi:email"
						iconColor="white"
						textColor="white"
						inputClass="text-white {isInviteFlow ? 'opacity-70' : ''}"
						disabled={isInviteFlow}
					/>
					{#if $errors.email}<span class="text-xs text-error-500">{$errors.email}</span>{/if}
					{#if isInviteFlow}<span class="text-xs text-primary-400">✓ Email pre-filled from invitation</span>{/if}

					<!-- Hidden email input to ensure form submission when disabled -->
					{#if isInviteFlow}
						<input type="hidden" name="email" value={$form.email} />
					{/if}

					<!-- Password field -->
					<FloatingInput
						id="passwordsignUp"
						name="password"
						type="password"
						tabindex={passwordTabIndex}
						required
						bind:value={$form.password}
						{showPassword}
						label={m.form_password()}
						{...$constraints.password}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						showPasswordBackgroundColor="dark"
						inputClass="text-white"
						autocomplete="new-password"
					/>
					{#if $errors.password}
						<span class="text-xs text-error-500">{$errors.password}</span>
					{/if}

					<!-- Password Confirm -->
					<FloatingInput
						id="confirm_passwordsignUp"
						name="confirm_password"
						type="password"
						tabindex={confirmPasswordTabIndex}
						required
						bind:value={$form.confirm_password}
						{showPassword}
						label={m.form_confirmpassword()}
						{...$constraints.confirm_password}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						showPasswordBackgroundColor="dark"
						inputClass="text-white"
						autocomplete="new-password"
					/>
					{#if $errors.confirm_password}
						<span class="text-xs text-error-500">{$errors.confirm_password}</span>
					{/if}

					<!-- Password Strength Indicator -->
					<PasswordStrength password={$form.password} confirmPassword={$form.confirm_password} />

					{#if firstUserExists == true && !isInviteFlow}
						<!-- Registration Token (hidden when using invite flow) -->
						<FloatingInput
							id="tokensignUp"
							name="token"
							type="password"
							tabindex={tokenTabIndex}
							required
							bind:value={$form.token}
							label={m.signup_registrationtoken()}
							{...$constraints.token}
							icon="mdi:key-chain"
							iconColor="white"
							textColor="white"
							showPasswordBackgroundColor="dark"
							inputClass="text-white"
							autocomplete="one-time-code"
						/>
						{#if $errors.token}
							<span class="text-xs text-error-500">{$errors.token}</span>
						{/if}
						{#if $form.token && inviteError}
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

					{#if inviteError && !$form.token}
						<span class="text-xs text-error-500">{inviteError}</span>
					{/if}

					{#if !privateEnv.USE_GOOGLE_OAUTH || !showOAuth}
						<!-- Email SignIn only -->
						<button type="submit" class="variant-filled btn mt-4 uppercase" aria-label={isInviteFlow ? 'Accept Invitation' : m.form_signup()}>
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

<style lang="postcss">
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
