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
	button_back,
	confirm_password,
	email,
	form_confirmpassword,
	form_password,
	form_required,
	form_resetpassword,
	form_signin,
	signin_forgottenpassword,
	signin_forgottontoast,
	signin_savenewpassword,
	twofa_code_placeholder,
	twofa_error_invalid_code,
	twofa_use_authenticator,
	twofa_use_backup_code,
	twofa_verify_button,
	twofa_verify_description,
	twofa_verify_title,
	twofa_verifying,
} from "@src/paraglide/messages";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { globalLoadingStore, loadingOperations } from "@src/stores/loading-store.svelte.ts";
import { screen } from "@src/stores/screen-size-store.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { Form } from "@utils/form.svelte.ts";
import { forgotFormSchema, loginFormSchema, resetFormSchema } from "@utils/schemas";
import { browser } from "$app/environment";
import { goto, preloadData } from "$app/navigation";
import { signIn as remoteSignIn, forgotPW as remoteForgotPW, resetPW as remoteResetPW } from "../auth.remote";
import type { ActionResult } from "@sveltejs/kit";
// Stores
import { page } from "$app/state";
import { enhance } from "$app/forms";
import type { PageData } from "../$types";
import SigninIcon from "./icons/signin-icon.svelte";
import OauthLogin from "./oauth-login.svelte";

// Props
const {
	active = $bindable(undefined),
	onClick = () => {},
	onPointerEnter: onPointerEnterProp = () => {},
	onBack = () => {},
	firstCollectionPath = "",
}: {
	active?: number;
	onClick?: () => void;
	onPointerEnter?: (e: PointerEvent) => void;
	onBack?: () => void;
	firstCollectionPath?: string;
} = $props();

const siteName = $derived(publicEnv.SITE_NAME || "SveltyCMS");

// State management
let P_WFORGOT = $state(false);
let P_WRESET = $state(false);

// FIX: let not const — const prevents $state reassignment so the
// password-visibility toggle silently broke.
let showPassword = $state(false);

// FIX: Separate formElement refs per form so wiggle targets the right one.
let loginFormElement: HTMLFormElement | null = $state(null);
let forgotFormElement: HTMLFormElement | null = $state(null);
let resetFormElement: HTMLFormElement | null = $state(null);
let twoFAFormElement: HTMLFormElement | null = $state(null);

const tabIndex = $state(1);

// Pre-calculate tab indices
const emailTabIndex = 1;
const passwordTabIndex = 2;
const confirmPasswordTabIndex = 3;
const forgotPasswordTabIndex = 4;
const pageData = page.data as PageData;

// FIX: Use page.url (reactive) instead of a static window.location.href snapshot.
const currentUrl = $derived(browser ? page.url : null);

// Spinner / auth state
let isSubmitting = $state(false);
let isAuthenticating = $state(false);

// 2FA state
let requires2FA = $state(false);
let twoFAUserId = $state("");
let twoFACode = $state("");
let useBackupCode = $state(false);
let isVerifying2FA = $state(false);

let prefetched = $state(false);

async function prefetchFirstCollection() {
	if (prefetched || !firstCollectionPath) return;
	prefetched = true;
	try {
		await preloadData(firstCollectionPath);
	} catch (error) {
		console.error("Prefetch failed:", error);
	}
}

// ---------------------------------------------------------------------------
// Utility — wiggle animation helper
// ---------------------------------------------------------------------------

function wiggle(el: HTMLFormElement | null) {
	if (!el) return;
	el.classList.add("wiggle");
	setTimeout(() => el.classList.remove("wiggle"), 300);
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

const loginForm = new Form({ email: "", password: "", isToken: false }, loginFormSchema);

async function handleLoginSubmit(event: Event) {
	event.preventDefault();
	if (loginForm.data.email) {
		loginForm.data.email = loginForm.data.email.toLowerCase();
	}

	if (!loginForm.validate()) {
		wiggle(loginFormElement);
		return;
	}

	isSubmitting = true;
	isAuthenticating = true;
	globalLoadingStore.startLoading(loadingOperations.authentication);

	try {
		const result = (await remoteSignIn({
			email: loginForm.data.email,
			password: loginForm.data.password,
			isToken: loginForm.data.isToken
		})) as any;

		isSubmitting = false;

		if (result.requires2FA) {
			requires2FA = true;
			twoFAUserId = result.userId || "";
			isAuthenticating = false;
			globalLoadingStore.stopLoading(loadingOperations.authentication);
			toast.warning({
				title: "Two-Factor Authentication Required",
				description: "Please enter your authentication code to continue",
			});
			import("svelte").then(({ tick }) => {
				tick().then(() => document.getElementById("twofa-code")?.focus());
			});
			return;
		}

		if (result.success && result.redirectPath) {
			isAuthenticating = true;
			sessionStorage.setItem(
				"flashMessage",
				JSON.stringify({
					type: "success",
					title: "Welcome Back!",
					description: `<iconify-icon icon="mdi:party-popper" width="24" class="mr-2 inline-block text-white"></iconify-icon> Successfully signed in.`,
					duration: 4000,
				})
			);
			window.location.href = result.redirectPath;
			return;
		}

		isAuthenticating = false;
		globalLoadingStore.stopLoading(loadingOperations.authentication);
		toast.error({ title: "Sign In Failed", description: result.message || "Invalid email or password" });
		wiggle(loginFormElement);
	} catch (error: any) {
		isSubmitting = false;
		isAuthenticating = false;
		globalLoadingStore.stopLoading(loadingOperations.authentication);
		const errorMessage = error?.message || "An unexpected error occurred";
		toast.error({ title: "Sign In Failed", description: errorMessage });
		wiggle(loginFormElement);
	}
}

// ---------------------------------------------------------------------------
// Forgot password form
// ---------------------------------------------------------------------------

const forgotForm = new Form({ email: "" }, forgotFormSchema);

async function handleForgotSubmit(event: Event) {
	event.preventDefault();
	if (forgotForm.data.email) {
		forgotForm.data.email = forgotForm.data.email.toLowerCase();
	}
	if (!forgotForm.validate()) {
		wiggle(forgotFormElement);
		return;
	}
	isSubmitting = true;

	try {
		await remoteForgotPW({ email: forgotForm.data.email });
		isSubmitting = false;
		P_WRESET = true;
		toast.success({ description: signin_forgottontoast() });
	} catch (error: any) {
		isSubmitting = false;
		const errorMessage = error?.message || "Password reset failed";
		toast.error({ title: "Reset Failed", description: errorMessage });
		wiggle(forgotFormElement);
	}
}

// ---------------------------------------------------------------------------
// Reset password form
// ---------------------------------------------------------------------------

const resetForm = new Form(
	{ password: "", confirm_password: "", token: "", email: "" },
	resetFormSchema,
);

async function handleResetSubmit(event: Event) {
	event.preventDefault();
	if (!resetForm.validate()) {
		wiggle(resetFormElement);
		return;
	}
	isSubmitting = true;
	globalLoadingStore.startLoading(loadingOperations.authentication);
	try {
		const result = (await remoteResetPW({
			password: resetForm.data.password,
			token: resetForm.data.token,
			email: resetForm.data.email
		})) as any;
		isSubmitting = false;
		P_WRESET = false;
		P_WFORGOT = false;

		toast.success({
			title: "Password Reset Successful",
			description: "You can now sign in with your new password",
		});
		if (result.success && result.redirectPath) {
			goto(result.redirectPath);
		}
	} catch (error: any) {
		isSubmitting = false;
		toast.error({
			title: "Reset Failed",
			description: error?.message || "Failed to reset password."
		});
		wiggle(resetFormElement);
	}
}

// ---------------------------------------------------------------------------
// 2FA — uses a hidden form with use:enhance for CSRF safety.
// Raw fetch bypasses SvelteKit's CSRF pipeline and loses typed ActionResult data.
// ---------------------------------------------------------------------------

const verify2FASubmit = () => ({
	onSubmit: () => {
		isVerifying2FA = true;
	},
	onResult: async ({ result }: { result: ActionResult }) => {
		isVerifying2FA = false;

		if (result.type === "redirect") {
			toast.success({ title: "Verification Successful", description: "Redirecting…" });
			window.location.href = result.location!;
			return;
		}

		if (result.type === "failure") {
			toast.error({
				description: result.data?.message || twofa_error_invalid_code(),
			});
			twoFACode = "";
		}

		if (result.type === "error") {
			toast.error({
				description: result.error?.message || "An unexpected error occurred",
			});
		}
	},
});

function submitTwoFA() {
	if (!twoFACode.trim() || isVerifying2FA) return;

	if (!useBackupCode && twoFACode.length !== 6) {
		toast.error({ description: twofa_error_invalid_code() });
		return;
	}
	if (useBackupCode && twoFACode.length < 8) {
		toast.error({ description: "Invalid backup code format" });
		return;
	}

	twoFAFormElement?.requestSubmit();
}

function handle2FAInput(event: Event) {
	const input = event.target as HTMLInputElement;
	let value = input.value;
	if (useBackupCode) {
		value = value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 10);
	} else {
		value = value.replace(/\D/g, "").slice(0, 6);
	}
	twoFACode = value;
}

function toggle2FACodeType() {
	useBackupCode = !useBackupCode;
	twoFACode = "";
}

function back2FAToLogin() {
	requires2FA = false;
	twoFAUserId = "";
	twoFACode = "";
	useBackupCode = false;
	isVerifying2FA = false;
}

// ---------------------------------------------------------------------------
// URL token effect — populates reset form from query params
// ---------------------------------------------------------------------------

// FIX: Derived from reactive page.url instead of a stale window.location snapshot.
$effect(() => {
	if (!currentUrl) return;
	const tokenParam = currentUrl.searchParams.get("token") || "";
	const emailParam = currentUrl.searchParams.get("email") || "";
	if (tokenParam && emailParam) {
		resetForm.data.token = tokenParam;
		resetForm.data.email = emailParam;
		P_WFORGOT = true;
		P_WRESET = true;
	}
});

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleBack(event: Event) {
	event.stopPropagation();
	if (P_WFORGOT || P_WRESET) {
		P_WFORGOT = false;
		P_WRESET = false;
	} else {
		onBack();
	}
}

function handleFormClick(event: Event) {
	event.stopPropagation();
	onClick();
}

function handleForgotPassword(event: Event) {
	event.stopPropagation();
	P_WFORGOT = true;
	P_WRESET = false;
}

// Class computations
const isActive = $derived(active === 0);
const isInactive = $derived(active !== undefined && active !== 0);
const isHover = $derived(active === undefined || active === 1);
const baseClasses = "hover relative flex items-center";

// Prefetch first collection data when active
$effect(() => {
	if (active === 0) prefetchFirstCollection();
});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
	onclick={handleFormClick}
	onkeydown={(e) => e.key === 'Enter' && onClick?.()}
	onpointerenter={onPointerEnterProp}
	tabindex={tabIndex}
	class="{baseClasses} focus-visible:outline-2 focus-visible:outline-primary-500"
	class:active={isActive}
	class:inactive={isInactive}
	class:hover={isHover}
>
	{#if active === 0}
		<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
			{#if screen.isDesktop}
				<div class="absolute inset-0 z-0">
					<FloatingPaths position={1} background="white" />
					<FloatingPaths position={-1} background="white" />
				</div>
			{/if}
			<div class="absolute left-1/2 top-[20%] z-20 hidden -translate-x-1/2 -translate-y-1/2 transform xl:block">
				<SveltyCMSLogoFull />
			</div>
			<div
				class="relative z-10 mx-auto mb-[5%] mt-[15%] w-full overflow-y-auto rounded-md bg-white/0 p-6 backdrop-blur lg:w-4/5"
				class:hide={active !== 0}
			>
				<a href="#signin-form" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white focus:text-black">Skip to sign-in form</a>
				<div class="flex flex-row gap-3 items-center">
					<SveltyCMSLogo size={68} className="w-14" fill="red" />
					<h1 class="text-3xl font-bold text-black lg:text-4xl">
						<div class="text-xs text-surface-300">
							<SiteName {siteName} highlight="CMS" textClass="text-black" />
						</div>
						{#if !P_WFORGOT && !P_WRESET}
							<div class="lg:-mt-1">{form_signin()}</div>
						{:else if P_WFORGOT && !P_WRESET}
							<div class="text-2xl lg:-mt-1 lg:text-4xl">{signin_forgottenpassword()}</div>
						{:else if P_WFORGOT && P_WRESET}
							<div class="lg:-mt-1">{form_resetpassword()}</div>
						{/if}
					</h1>
				</div>

				<!-- Required label + Back button -->
				<!-- FIX: Icon was ri:arrow-right-line (→); corrected to ← -->
				<div class="-mt-8 mb-4 relative flex items-center justify-center text-xs text-error-500">
					{form_required()}
					<div class="absolute right-0">
						<SystemTooltip title="Go Back">
							<Button
								onclick={handleBack}
								aria-label="Go back"
								variant="outline"
								rounded={true}
								class="w-10 h-10 p-0 flex items-center justify-center text-black border-surface-300! hover:bg-surface-100"
							>
								<iconify-icon icon="ri:arrow-left-line" width={24}></iconify-icon>
							</Button>
						</SystemTooltip>
					</div>
				</div>

				<!-- --------------------------------------------------------- -->
				<!-- Sign In form                                               -->
				<!-- FIX: Hidden (not just absent) when 2FA panel is active    -->
				<!-- --------------------------------------------------------- -->
				{#if !P_WFORGOT && !P_WRESET}
					<div class:hidden={requires2FA}>
						<form
							id="signin-form"
							onsubmit={handleLoginSubmit}
							bind:this={loginFormElement}
							class="flex w-full flex-col gap-3"
							class:hide={active !== 0}
							inert={active !== 0}
							aria-label="Sign in"
						>
							<!-- Email -->
							<FloatingInput
								id="emailsignIn"
								name="email"
								type="email"
								tabindex={emailTabIndex}
								autocomplete="username"
								autocapitalize="none"
								spellcheck={false}
								bind:value={loginForm.data.email}
								label={email()}
								required
								icon="mdi:email"
								iconColor="black"
								textColor="black"
								data-testid="signin-email"
								invalid={!!loginForm.errors.email}
								errorMessage={loginForm.errors.email?.[0] || ''}
							/>

							<!-- Password -->
							<FloatingInput
								id="passwordsignIn"
								name="security"
								type="security"
								autocomplete="current-password"
								tabindex={passwordTabIndex}
								bind:value={loginForm.data.password}
								bind:showPassword
								required
								label={form_password()}
								icon="mdi:lock"
								iconColor="black"
								textColor="black"
								passwordIconColor="black"
								data-testid="signin-password"
								invalid={!!loginForm.errors.password}
								errorMessage={loginForm.errors.password?.[0] || ''}
							/>
						</form>

						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
							<div class="flex w-full justify-between gap-2 sm:w-auto">
								<Button
									type="submit"
									form="signin-form"
									variant="surface"
									class="w-full text-white sm:w-auto"
									aria-label={form_signin()}
									data-testid="signin-submit"
									loading={isSubmitting || isAuthenticating}
								>
									{form_signin()}
								</Button>

								<OauthLogin showGoogleOAuth={pageData.showGoogleOAuth} showGithubOAuth={pageData.showGithubOAuth} {firstCollectionPath} />
							</div>

							<div class="mt-4 flex w-full justify-between sm:mt-0 sm:w-auto">
								<Button
									type="button"
									variant="outline"
									class="w-full text-black sm:w-auto hover:bg-surface-100"
									aria-label={signin_forgottenpassword()}
									tabindex={forgotPasswordTabIndex}
									onclick={handleForgotPassword}
									data-testid="signin-forgot-password"
								>
									{signin_forgottenpassword()}
								</Button>
							</div>
						</div>
					</div>

					<!-- ------------------------------------------------------- -->
					<!-- Two-Factor Authentication panel                        -->
					<!-- ------------------------------------------------------- -->
					{#if requires2FA}
						<div class="flex w-full flex-col gap-4" role="region" aria-label="Two-factor authentication">
							<div class="text-center">
								<div class="mb-3">
									<iconify-icon icon="mdi:shield-key" width={24} aria-hidden="true"></iconify-icon>
								</div>
								<h3 class="h3 mb-2">{twofa_verify_title()}</h3>
								<p class="text-sm text-surface-600 dark:text-surface-300">
									{useBackupCode ? "Enter your backup recovery code:" : twofa_verify_description()}
								</p>
							</div>

							<div class="flex flex-col gap-3">
								<div class="relative">
									<!-- FIX: aria-label added to 2FA input -->
									<input
										type="text"
										id="twofa-code"
										bind:value={twoFACode}
										oninput={handle2FAInput}
										onkeydown={(e) => e.key === "Enter" && submitTwoFA()}
										placeholder={useBackupCode ? "Enter backup code" : twofa_code_placeholder()}
										aria-label={useBackupCode ? "Backup recovery code" : "Authenticator code"}
										class="input text-center font-mono tracking-wider"
										class:text-2xl={!useBackupCode}
										class:text-lg={useBackupCode}
										maxlength={useBackupCode ? 10 : 6}
										autocomplete="one-time-code"
										inputmode={useBackupCode ? "text" : "numeric"}
									/>
									{#if useBackupCode}
										<div class="mt-1 text-center text-xs text-surface-600 dark:text-surface-400" aria-live="polite">
											{twoFACode.length}/10
										</div>
									{/if}
								</div>

								<div class="text-center">
									<button
										type="button"
										onclick={toggle2FACodeType}
										class="text-sm text-tertiary-500 dark:text-primary-500 underline hover:text-tertiary-600 dark:text-primary-600"
										aria-label={useBackupCode ? twofa_use_authenticator() : twofa_use_backup_code()}
									>
										{useBackupCode ? twofa_use_authenticator() : twofa_use_backup_code()}
									</button>
								</div>

								<div class="flex gap-3">
									<button
										type="button"
										onclick={back2FAToLogin}
										class="btn preset-tonal-surface-500 flex-1"
										aria-label={button_back()}
									>
										<iconify-icon icon="mdi:arrow-left" width={20} class="mr-2" aria-hidden="true"></iconify-icon>
										{button_back()}
									</button>

									<button
										type="button"
										onclick={submitTwoFA}
										disabled={!twoFACode.trim() ||
											isVerifying2FA ||
											(!useBackupCode && twoFACode.length !== 6) ||
											(useBackupCode && twoFACode.length < 8)}
										class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500 flex-1"
										aria-label={twofa_verify_button()}
									>
										{#if isVerifying2FA}
											<!-- FIX: alt="" + aria-hidden on spinner image -->
											<img src="/Spinner.svg" alt="" aria-hidden="true" class="mr-2 h-5 invert filter" />
											{twofa_verifying()}
										{:else}
											<iconify-icon icon="mdi:check" width={20} class="mr-2" aria-hidden="true"></iconify-icon>
											{twofa_verify_button()}
										{/if}
									</button>
								</div>

								<div class="mt-2 text-center text-xs text-surface-600 dark:text-surface-400" aria-live="polite">
									{#if !useBackupCode}
										<p>Enter the 6-digit code from your authenticator app</p>
									{:else}
										<p>Enter one of your 8-character backup codes</p>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				{/if}

				<!-- Hidden 2FA form — uses enhance for CSRF safety and proper redirect handling -->
				<form
					method="POST"
					action="?/verify2FA"
					use:enhance={verify2FASubmit as any}
					bind:this={twoFAFormElement}
					class="sr-only"
					aria-hidden="true"
					inert
				>
					<input type="hidden" name="userId" value={twoFAUserId} />
					<input type="hidden" name="code" value={twoFACode} />
				</form>

				<!-- --------------------------------------------------------- -->
				<!-- Forgotten Password form                                   -->
				<!-- --------------------------------------------------------- -->
				{#if P_WFORGOT && !P_WRESET}
					<form
						onsubmit={handleForgotSubmit}
						bind:this={forgotFormElement}
						class="flex w-full flex-col gap-3"
						class:hide={active !== 0}
						inert={active !== 0}
						aria-label="Forgot password"
					>
						<FloatingInput
							id="emailforgot"
							name="email"
							type="email"
							tabindex={emailTabIndex}
							autocomplete="email"
							autocapitalize="none"
							spellcheck={false}
							bind:value={forgotForm.data.email}
							label={email()}
							required
							icon="mdi:email"
							invalid={!!forgotForm.errors.email}
							errorMessage={forgotForm.errors.email?.[0] || ''}
						/>

						<div class="mt-4 flex items-center justify-between">
							<button
								type="submit"
								class="preset-filled-surface-500 text-white btn"
								aria-label={form_resetpassword()}
							>
								{form_resetpassword()}
								{#if isSubmitting}
									<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter" />
								{/if}
							</button>

							<button
								type="button"
								class="btn-icon preset-filled-surface-500 rounded-full"
								aria-label="Back to sign in"
								onclick={() => { P_WFORGOT = false; P_WRESET = false; }}
							>
								<iconify-icon icon="mdi:arrow-left-circle" width={24} aria-hidden="true"></iconify-icon>
							</button>
						</div>
					</form>
				{/if}

				<!-- --------------------------------------------------------- -->
				<!-- Reset Password form                                       -->
				<!-- FIX: Removed duplicate name="token" FloatingInput and     -->
				<!-- second duplicate hidden name="email" input.               -->
				<!-- Token and email are passed as hidden fields only.         -->
				<!-- --------------------------------------------------------- -->
				{#if P_WFORGOT && P_WRESET}
					<form
						onsubmit={handleResetSubmit}
						bind:this={resetFormElement}
						class="flex w-full flex-col gap-3"
						class:hide={active !== 0}
						inert={active !== 0}
						aria-label="Reset password"
					>
						<!-- Hidden fields — token and email come from URL params -->
						<input type="hidden" name="email" value={resetForm.data.email} />
						<input type="hidden" name="token" value={resetForm.data.token} />

						<!-- New password -->
						<FloatingInput
							id="passwordreset"
							name="password"
							type="security"
							tabindex={passwordTabIndex}
							bind:value={resetForm.data.password}
							bind:showPassword
							required
							autocomplete="new-password"
							label={form_password()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
							passwordIconColor="black"
							invalid={!!resetForm.errors.password}
							errorMessage={resetForm.errors.password?.[0] || ''}
						/>

						<!-- Confirm password -->
						<FloatingInput
							id="confirm_passwordreset"
							name="confirm_password"
							type="security"
							tabindex={confirmPasswordTabIndex}
							bind:value={resetForm.data.confirm_password}
							bind:showPassword
							autocomplete="new-password"
							label={confirm_password?.() || form_confirmpassword?.()}
							icon="mdi:lock"
							iconColor="black"
							textColor="black"
							passwordIconColor="black"
							invalid={!!resetForm.errors.confirm_password}
							errorMessage={resetForm.errors.confirm_password?.[0] || ''}
						/>

						<!-- Password Strength Indicator -->
						<PasswordStrength
							password={resetForm.data.password}
							confirmPassword={resetForm.data.confirm_password}
						/>

						<div class="mt-4 flex items-center justify-between">
							<button
								type="submit"
								aria-label={signin_savenewpassword()}
								class="btn preset-filled-surface-500 ml-2 mt-6 text-white"
							>
								{signin_savenewpassword()}
								{#if isSubmitting}
									<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6" />
								{/if}
							</button>

							<button
								type="button"
								aria-label={button_back()}
								class="preset-filled-surface-500 btn-icon"
								onclick={() => { P_WFORGOT = false; P_WRESET = false; }}
							>
								<iconify-icon icon="mdi:arrow-left-circle" width={24} aria-hidden="true"></iconify-icon>
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
		opacity: 0;
		transition: 0s;
	}
	section {
		--width: 0%;
		flex-grow: 1;
		width: var(--width);
		background: white;
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
		border-top-right-radius: 5% 50%;
		border-bottom-right-radius: 5% 50%;
	}

	:global(.wiggle) {
		animation: wiggle 0.3s forwards;
	}
	@keyframes wiggle {
		from { transform: translateX(0); }
		25% { transform: translateX(150px); }
		50% { transform: translateX(-75px); }
		75% { transform: translateX(200px); }
		100% { transform: translateX(0px); }
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.wiggle) { animation: none !important; }
		section { transition: none !important; }
		.hover:hover { width: var(--width) !important; border-radius: 0 !important; }
	}
</style>
