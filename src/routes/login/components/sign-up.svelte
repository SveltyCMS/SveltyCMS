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
import PasswordStrength from "@src/components/password-strength.svelte";
import SiteName from "@src/components/site-name.svelte";
// Components
import FloatingPaths from "@src/components/system/floating-paths.svelte";
import SveltyCMSLogo from "@src/components/system/icons/svelty-cms-logo.svelte";
import SveltyCMSLogoFull from "@src/components/system/icons/svelty-cms-logo-full.svelte";
import FloatingInput from "@components/ui/floating-input.svelte";
import Button from "@components/ui/button.svelte";
import SystemTooltip from "@src/components/system/system-tooltip.svelte";
// ParaglideJS
import {
	confirm_password,
	email,
	form_confirmpassword,
	form_password,
	form_required,
	form_signup,
	registration_token,
	username,
} from "@src/paraglide/messages";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { screen } from "@src/stores/screen-size-store.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { Form } from "@utils/form.svelte.ts";
import { signUpFormSchema } from "@utils/schemas";
import { logger } from "@utils/logger";
import { browser } from "$app/environment";
import { preloadData } from "$app/navigation";
// Stores
import { page } from "$app/state";
import type { PageData } from "../$types";
import SignupIcon from "./icons/signup-icon.svelte";

// Props
const {
	active = $bindable(undefined),
	isInviteFlow = false,
	token = "",
	invitedEmail = "",
	inviteError = "",
	onClick = () => {},
	onPointerEnter = () => {},
	onBack = () => {},
	firstCollectionPath = "",
} = $props();

const siteName = $derived(publicEnv.SITE_NAME || "SveltyCMS");

const pageData = page.data as PageData;
const firstUserExists = pageData.firstUserExists;
const showGoogleOAuth = pageData.showGoogleOAuth;
const showGithubOAuth = pageData.showGithubOAuth;
const hasExistingOAuthUsers = pageData.hasExistingOAuthUsers;

// isOpenSignup: true only when multiTenant AND demoMode are both active.
// This is the only scenario where a registration token is not required.
// Requires +page.server.ts load to return: isOpenSignup: !!(multiTenant && demoMode)
const isOpenSignup = pageData.isOpenSignup ?? false;

// State management
const tabIndex = $state(1);
let formElement: HTMLFormElement | null = $state(null);
let showPassword = $state(false);
let isSubmitting = $state(false);
let isRedirecting = $state(false);

let prefetched = $state(false);

async function prefetchFirstCollection() {
	if (prefetched || !firstCollectionPath) {
		return;
	}
	prefetched = true;

	try {
		await preloadData(firstCollectionPath);
	} catch (error) {
		console.error("Prefetch failed:", error);
	}
}

// Pre-calculate tab indices
const usernameTabIndex = 1;
const emailTabIndex = 2;
const passwordTabIndex = 3;
const confirmPasswordTabIndex = 4;
const tokenTabIndex = 5;

// Form setup
const signUpForm = new Form(
	{ username: "", email: "", password: "", confirm_password: "", token: "" },
	signUpFormSchema,
);

async function handleSignUpSubmit(event: Event) {
	event.preventDefault();
	if (Object.keys(signUpForm.errors).length > 0) {
		formElement?.classList.add("wiggle");
		setTimeout(() => {
			formElement?.classList.remove("wiggle");
		}, 300);
		return;
	}
	isSubmitting = true;

	try {
		const { signUp: remoteSignUp } = await import("../auth.remote");
		const result = (await remoteSignUp({
			email: signUpForm.data.email,
			username: signUpForm.data.username,
			password: signUpForm.data.password,
			token: signUpForm.data.token
		})) as any;

		isSubmitting = false;

		if (result.success && result.redirectPath) {
			isRedirecting = true;
			toast.success({
				title: "Account Created!",
				description: "Welcome to SveltyCMS. Redirecting to your dashboard...",
			});
			window.location.href = result.redirectPath;
			return;
		}

		toast.error({
			title: "Sign Up Failed",
			description: result.message || "Failed to create account",
		});
		formElement?.classList.add("wiggle");
		setTimeout(() => {
			formElement?.classList.remove("wiggle");
		}, 300);
	} catch (error: any) {
		isSubmitting = false;
		isRedirecting = false;
		toast.error({
			title: "Sign Up Failed",
			description: error?.message || "An unexpected error occurred",
		});
		formElement?.classList.add("wiggle");
		setTimeout(() => {
			formElement?.classList.remove("wiggle");
		}, 300);
	}
}

// Reactive form values for easier access
const currentFormToken = $derived(signUpForm.data.token);

// URL parameter handling - update params when URL changes
const params = $derived(
	browser
		? new URL(window.location.href).searchParams
		: new URLSearchParams(""),
);

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
		const inviteToken = params.get("invite_token") || params.get("regToken");
		if (inviteToken && inviteToken !== signUpForm.data.token) {
			signUpForm.data.token = inviteToken;
		}
	}
	// Also check if the form was pre-filled by the server (invalid token case)
	if (browser && signUpForm.data.token && !isInviteFlow) {
		logger.debug("Form token pre-filled by server:", signUpForm.data.token);
	}
});

// Event handlers
function handleOAuth(provider: "google" | "github") {
	// All users require invite tokens (first user goes through /setup).
	// In open-signup demo mode (multiTenant + demoMode), OAuth is also permitted without a token.
	if (!(isInviteFlow || isOpenSignup || hasExistingOAuthUsers || currentFormToken)) {
		toast.error({
			title: "Invitation Required",
			description:
				"Please enter your invitation token before using Google OAuth. OAuth registration requires an invitation from an administrator.",
		});
		return;
	}

	const form = document.createElement("form");
	form.method = "post";

	// Use signInOAuth action when in invite flow to preserve invite token
	const actionBase = provider === "github" ? "?/signInOAuthGithub" : "?/signInOAuth";
	if (isInviteFlow && token) {
		// Build the action URL with the invite token as a query parameter
		form.action = `${actionBase}&invite_token=${encodeURIComponent(token)}`;
	} else if (currentFormToken) {
		// User has entered a token in the form, pass it along
		form.action = `${actionBase}&invite_token=${encodeURIComponent(currentFormToken)}`;
	} else {
		form.action = actionBase;
	}

	document.body.appendChild(form);
	form.submit();
	document.body.removeChild(form);
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

const baseClasses = "hover relative flex items-center overflow-y-auto";

// Prefetch first collection data when active
$effect(() => {
	if (active === 1) {
		prefetchFirstCollection();
	}
});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
	onclick={handleFormClick}
	onkeydown={(e) => e.key === 'Enter' && onClick?.()}
	onpointerenter={handlePointerEnter}
	tabindex={tabIndex}
	class="{baseClasses} focus-visible:outline-2 focus-visible:outline-primary-500"
	class:active={isActive}
	class:inactive={isInactive}
	class:hover={isHover}
>
	{#if active === 1}
		<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
			{#if screen.isDesktop}
				<div class="absolute inset-0 z-0">
					<FloatingPaths position={1} background="dark" mirrorAnimation />
					<FloatingPaths position={-1} background="dark" mirrorAnimation />
				</div>
			{/if}
			<!-- CSS Logo -->
			<div class="absolute left-1/2 top-[20%] z-20 hidden -translate-x-1/2 -translate-y-1/2 transform xl:block"><SveltyCMSLogoFull /></div>
			<div class="relative z-10 mx-auto mb-[5%] mt-[15%] w-full rounded-md bg-surface-900/0 p-6 backdrop-blur lg:w-4/5" class:hide={active !== 1}>
				<a href="#signup-form" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white focus:text-black">Skip to sign-up form</a>
				<div class="flex flex-row gap-3 items-center">
					<SveltyCMSLogo size={68} className="w-14" fill="red" />

					<h1 class="text-3xl font-bold text-white lg:text-4xl">
						<div class="text-xs text-surface-200"><SiteName {siteName} highlight="CMS" /></div>
						<div class="wrap-break-word lg:-mt-1">
							{#if isInviteFlow}
								{form_signup()}
								<span class="text-2xl text-tertiary-500 dark:text-primary-500 sm:text-3xl">: Complete Invitation</span>
							{:else}
								{form_signup()}
								<span class="text-2xl capitalize text-tertiary-500 dark:text-primary-500 sm:text-3xl">: New User</span>
							{/if}
						</div>
					</h1>
				</div>

				<!-- Required with Back button -->
				<div class="relative mb-2 flex h-10 items-center justify-center text-xs text-error-500">
					{form_required()}

					<div class="absolute right-0">
						<SystemTooltip title="Go Back">
							<Button
								onclick={handleBack}
								aria-label="Go back"
								variant="outline"
								rounded={true}
								class="w-10 h-10 p-0 flex items-center justify-center text-white border-surface-600! hover:bg-surface-800"
							>
								<iconify-icon icon="ri:arrow-left-line" width={24}></iconify-icon>
							</Button>
						</SystemTooltip>
					</div>
				</div>

				<form
					id="signup-form"
					onsubmit={handleSignUpSubmit}
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
						label={username()}
						minlength={2}
						maxlength={24}
						icon="mdi:user-circle"
						iconColor="white"
						textColor="white"
						inputClass="text-white"
						autocomplete="username"
						invalid={!!signUpForm.errors.username}
						errorMessage={signUpForm.errors.username?.[0] || ''}
					/>

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
						label={email()}
						minlength={5}
						maxlength={50}
						icon="mdi:email"
						iconColor="white"
						textColor="white"
						inputClass="text-white {isInviteFlow ? 'opacity-70' : ''}"
						disabled={isInviteFlow}
						invalid={!!signUpForm.errors.email}
						errorMessage={signUpForm.errors.email?.[0] || ''}
					/>
					{#if isInviteFlow}
						<span class="text-xs text-tertiary-500 dark:text-primary-500">? Email pre-filled from invitation</span>
					{/if}

					<!-- Hidden email input to ensure form submission when disabled -->
					{#if isInviteFlow}
						<input type="hidden" name="email" value={signUpForm.data.email} />
					{/if}

					<!-- Password field -->
					<FloatingInput
						id="passwordsignUp"
						name="password"
						type="security"
						tabindex={passwordTabIndex}
						required
						bind:value={signUpForm.data.password}
						bind:showPassword
						label={form_password()}
						minlength={8}
						maxlength={64}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						passwordIconColor="white"
						inputClass="text-white"
						autocomplete="new-password"
						invalid={!!signUpForm.errors.password}
						errorMessage={signUpForm.errors.password?.[0] || ''}
					/>

					<!-- Password Confirm -->
					<FloatingInput
						id="confirm_passwordsignUp"
						name="confirm_password"
						type="security"
						tabindex={confirmPasswordTabIndex}
						required
						bind:value={signUpForm.data.confirm_password}
						bind:showPassword
						label={confirm_password?.() || form_confirmpassword?.()}
						minlength={8}
						maxlength={64}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						passwordIconColor="white"
						inputClass="text-white"
						autocomplete="new-password"
						invalid={!!signUpForm.errors.confirm_password}
						errorMessage={signUpForm.errors.confirm_password?.[0] || ''}
					/>
					<!-- Password Strength Indicator -->
					<PasswordStrength password={signUpForm.data.password} confirmPassword={signUpForm.data.confirm_password} />

					<!-- Registration Token
						 Hidden only in open-signup mode (multiTenant + demoMode).
						 Single-tenant demo mode still requires a token and will render this field. -->
					{#if !isInviteFlow && !isOpenSignup}
						<div class="flex items-center space-x-2">
							<FloatingInput
								id="tokensignUp"
								name="token"
								type="security"
								tabindex={tokenTabIndex}
								required
								bind:value={signUpForm.data.token}
								label={registration_token()}
								minlength={32}
								maxlength={64}
								icon="mdi:key-chain"
								iconColor="white"
								textColor="white"
								passwordIconColor="white"
								inputClass="text-white"
								autocomplete="one-time-code"
								invalid={!!signUpForm.errors.token}
								errorMessage={signUpForm.errors.token?.[0] || ''}
							/>
						</div>
						{#if signUpForm.data.token && inviteError}
							<span class="text-xs text-warning-400">Token was pre-filled from URL and will be validated against the server</span>
						{/if}
					{:else if isInviteFlow}
						<!-- Hidden token field for invite flow -->
						<input type="hidden" name="token" value={token} />
						<span class="text-xs text-tertiary-500 dark:text-primary-500">Using invitation token</span>
					{/if}

					{#if inviteError && !signUpForm.data.token}
						<span class="text-xs text-error-500">{inviteError}</span>
					{/if}

					{#if !showGoogleOAuth && !showGithubOAuth}
						<!-- Email SignIn only -->
						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
							<Button
								type="submit"
								form="signup-form"
								variant="surface"
								class="w-full text-white sm:w-auto"
								aria-label={isInviteFlow ? 'Accept Invitation' : form_signup()}
								loading={isSubmitting || isRedirecting}
							>
								{isInviteFlow ? 'Accept Invitation & Create Account' : form_signup()}
							</Button>
						</div>
						<!-- Email + OAuth signin  -->
					{:else}
						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
							<div class="flex w-full justify-between gap-2 sm:w-auto">
								<Button
									type="submit"
									form="signup-form"
									variant="surface"
									class="w-full text-white sm:w-auto"
									aria-label={isInviteFlow ? 'Accept Invitation' : form_signup()}
									loading={isSubmitting || isRedirecting}
								>
									{isInviteFlow ? 'Accept Invitation' : form_signup()}
								</Button>

								{#if showGoogleOAuth}
									<Button
										type="button"
										variant="outline"
										onclick={() => handleOAuth("google")}
										aria-label="Google OAuth"
										rounded={true}
										class="w-10 h-10 p-0 flex items-center justify-center border-surface-600! hover:bg-surface-800"
									>
										<iconify-icon icon="flat-color-icons:google" width={24}></iconify-icon>
									</Button>
								{/if}

								{#if showGithubOAuth}
									<Button
										type="button"
										variant="outline"
										onclick={() => handleOAuth("github")}
										aria-label="GitHub OAuth"
										rounded={true}
										class="w-10 h-10 p-0 flex items-center justify-center border-surface-600! hover:bg-surface-800 text-white"
									>
										<iconify-icon icon="mdi:github" width={24}></iconify-icon>
									</Button>
								{/if}
							</div>
						</div>

						{#if !isInviteFlow && firstUserExists && !hasExistingOAuthUsers}
							<p class="mt-2 text-xs text-surface-400">
								?? Note: Both email/password and Google OAuth registration require an invitation token from an administrator.
							</p>
						{:else if !isInviteFlow && hasExistingOAuthUsers}
							<p class="mt-2 text-xs text-surface-400">?? Note: New user registration requires an invitation token from an administrator.</p>
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
		opacity: 0;
		transition: 0s;
	}
	section {
		--width: 0%;
		flex-grow: 1;
		width: var(--width);
		background: #242728;
		transition: 0.4s;
	}
	.active {
		--width: 90%;
	}
	.inactive {
		--width: 10%;
	}
	.hover:hover {
		width: calc(var(--width) + 10%);
		border-top-left-radius: 5% 50%;
		border-bottom-left-radius: 5% 50%;
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
	@media (prefers-reduced-motion: reduce) {
		:global(.wiggle) { animation: none !important; }
		section { transition: none !important; }
		.hover:hover { width: var(--width) !important; border-radius: 0 !important; }
	}
</style>
