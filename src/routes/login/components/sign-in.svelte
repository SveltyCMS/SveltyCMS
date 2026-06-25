<!--
@file src/routes/login/components/sign-in.svelte
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
import Input from "@components/ui/input.svelte";
import Button from "@components/ui/button.svelte";
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
// Stores
import { page } from "$app/state";
import type { PageData } from "../$types";
import type { LoginBranding } from "@utils/theme-merge";
import SigninIcon from "./icons/signin-icon.svelte";
import OauthLogin from "./oauth-login.svelte";
import { fade } from 'svelte/transition';

// Props
const {
	active = $bindable(undefined),
	onClick = () => {},
	onPointerEnter: onPointerEnterProp = () => {},
	onBack = () => {},
	firstCollectionPath = "",
	branding = undefined,
}: {
	active?: number;
	onClick?: () => void;
	onPointerEnter?: (e: PointerEvent) => void;
	onBack?: () => void;
	firstCollectionPath?: string;
	branding?: LoginBranding;
} = $props();

const siteName = $derived(branding?.siteName || publicEnv.SITE_NAME || "SveltyCMS");
const brandedLogin = $derived(branding?.brandedLogin ?? false);
const brandedVariant = $derived(branding?.variant ?? "bordered");

// State management
let P_WFORGOT = $state(false);
let P_WRESET = $state(false);
let P_WMAGIC = $state(false);
let isPasskeyLoading = $state(false);

// FIX: let not const — const prevents $state reassignment so the
// password-visibility toggle silently broke.
let showPassword = $state(false);

// FIX: Separate formElement refs per form so wiggle targets the end one.
let loginFormElement: HTMLFormElement | null = $state(null);
let forgotFormElement: HTMLFormElement | null = $state(null);
let resetFormElement: HTMLFormElement | null = $state(null);
let magicFormElement: HTMLFormElement | null = $state(null);

const isInteractiveCard = $derived(active === undefined);
const cardTabIndex = $derived(isInteractiveCard ? 0 : -1);
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
		const { signIn: remoteSignIn } = await import("../auth.remote");
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
					description: `<iconify-icon icon="mdi:party-popper" width="24" class="me-2 inline-block text-white"></iconify-icon> Successfully signed in.`,
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

// ---------------------------------------------------------------------------
// Magic Link form
// ---------------------------------------------------------------------------

const magicForm = new Form({ email: "" }, forgotFormSchema);

function base64UrlToBuffer(base64url: string): Uint8Array {
	const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
	const base64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64);
	const buf = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
	return buf;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function handlePasskeySignIn() {
	if (!browser) return;
	const email = (loginForm.data.email || "").trim().toLowerCase();
	if (!email) {
		toast.error({ title: "Email required", description: "Enter your email above, then use Passkey sign-in." });
		return;
	}
	if (!window.PublicKeyCredential) {
		toast.error({ title: "Unsupported", description: "Passkeys are not supported in this browser." });
		return;
	}

	isPasskeyLoading = true;
	try {
		const { getPasskeyAuthOptions, verifyPasskeyAuth } = await import("../auth.remote");
		const opts = await getPasskeyAuthOptions({ email });
		if (!opts.success || !opts.options) {
			toast.error({ title: "Passkey unavailable", description: opts.message || "No passkey found for this account." });
			return;
		}

		const credential = (await navigator.credentials.get({
				publicKey: {
					...opts.options,
					challenge: base64UrlToBuffer(opts.options.challenge) as BufferSource,
					allowCredentials: opts.options.allowCredentials?.map((c) => ({
												type: 'public-key' as const,
												id: base64UrlToBuffer(c.id),
												transports: c.transports as AuthenticatorTransport[] | undefined,
											})) as PublicKeyCredentialDescriptor[],
				},
			})) as PublicKeyCredential | null;

		if (!credential) {
			toast.error({ title: "Cancelled", description: "Passkey sign-in was cancelled." });
			return;
		}

		const response = credential.response as AuthenticatorAssertionResponse;
		const result = await verifyPasskeyAuth({
			email,
			assertion: {
				id: credential.id,
				rawId: bufferToBase64Url(credential.rawId),
				type: credential.type,
				response: {
					authenticatorData: bufferToBase64Url(response.authenticatorData),
					clientDataJSON: bufferToBase64Url(response.clientDataJSON),
					signature: bufferToBase64Url(response.signature),
				},
			},
		});

		if (result.success && result.redirectPath) {
			await goto(result.redirectPath, { invalidateAll: true });
		} else {
			toast.error({ title: "Passkey failed", description: result.message || "Authentication failed." });
		}
	} catch (error: any) {
		toast.error({ title: "Passkey error", description: error?.message || "Passkey authentication failed." });
	} finally {
		isPasskeyLoading = false;
	}
}

async function handleMagicSubmit(event: Event) {
	event.preventDefault();
	if (magicForm.data.email) {
		magicForm.data.email = magicForm.data.email.toLowerCase();
	}
	if (!magicForm.validate()) {
		wiggle(magicFormElement);
		return;
	}
	isSubmitting = true;

	try {
		const { requestMagicLink } = await import("../auth.remote");
		const result = await requestMagicLink({ email: magicForm.data.email });
		isSubmitting = false;
		if (result.success) {
			toast.success({ title: "Magic Link Sent", description: result.message || "Please check your inbox for the sign-in link." });
			P_WMAGIC = false;
		} else {
			toast.error({ title: "Request Failed", description: result.message || "Failed to send magic link" });
		}
	} catch (error: any) {
		isSubmitting = false;
		const errorMessage = error?.message || "Failed to request magic link";
		toast.error({ title: "Request Failed", description: errorMessage });
		wiggle(magicFormElement);
	}
}


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
		const { forgotPW: remoteForgotPW } = await import("../auth.remote");
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
		const { resetPW: remoteResetPW } = await import("../auth.remote");
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

async function submitTwoFA() {
	if (!twoFACode.trim() || isVerifying2FA) return;

	if (!useBackupCode && twoFACode.length !== 6) {
		toast.error({ description: twofa_error_invalid_code() });
		return;
	}
	if (useBackupCode && twoFACode.length < 8) {
		toast.error({ description: "Invalid backup code format" });
		return;
	}

	isVerifying2FA = true;
	try {
		const { verify2FA } = await import("../auth.remote");
		const result = (await verify2FA({ userId: twoFAUserId, code: twoFACode })) as any;
		isVerifying2FA = false;
		if (result.success && result.redirectPath) {
			toast.success({ title: "Verification Successful", description: "Redirecting…" });
			window.location.href = result.redirectPath;
			return;
		}
		toast.error({ description: result.message || twofa_error_invalid_code() });
		twoFACode = "";
	} catch (e: any) {
		isVerifying2FA = false;
		toast.error({ description: e?.message || twofa_error_invalid_code() });
		twoFACode = "";
	}
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
	if (P_WFORGOT && P_WRESET) {
		P_WRESET = false;
	} else if (P_WFORGOT) {
		P_WFORGOT = false;
	} else if (P_WMAGIC) {
		P_WMAGIC = false;
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
	tabindex={cardTabIndex}
	class="{baseClasses} focus-visible:outline-2 focus-visible:outline-primary-500"
	class:active={isActive}
	class:inactive={isInactive}
	class:hover={isHover}
>
	{#if active === 0}
		<div transition:fade={{ duration: 250 }} class="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
			{#if screen.isDesktop}
				<div class="absolute inset-0 z-0">
					<FloatingPaths position={1} background="white" />
					<FloatingPaths position={-1} background="white" />
				</div>
			{/if}
			<div class="absolute inset-s-1/2 top-[20%] z-20 hidden -translate-x-1/2 -translate-y-1/2 transform xl:block">
				<SveltyCMSLogoFull {siteName} />
			</div>
			<div
				class="relative z-10 mx-auto mb-[5%] mt-[15%] w-full overflow-y-auto rounded p-6 backdrop-blur lg:w-4/5 {brandedLogin && brandedVariant === 'elevated'
					? 'bg-white shadow-xl border border-surface-200'
					: 'bg-white/0'}"
				class:hide={active !== 0}
			>
				<a href="#signin-form" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white focus:text-black">Skip to sign-in form</a>
				<div class="flex flex-row gap-3 items-center">
					<SveltyCMSLogo size={68} className="w-14" fill="red" />
					<h1 class="text-3xl font-bold text-black lg:text-4xl">
						<div class="text-xs text-surface-300">
							<SiteName {siteName} highlight="CMS" textClass="text-black" />
						</div>
						{#if !P_WFORGOT && !P_WRESET && !P_WMAGIC}
							<div class="lg:-mt-1">{form_signin()}</div>
						{:else if P_WMAGIC}
							<div class="text-2xl lg:-mt-1 lg:text-4xl">Sign in via Magic Link</div>
						{:else if P_WFORGOT && !P_WRESET}
							<div class="text-2xl lg:-mt-1 lg:text-4xl">{signin_forgottenpassword()}</div>
						{:else if P_WFORGOT && P_WRESET}
							<div class="lg:-mt-1">{form_resetpassword()}</div>
						{/if}
					</h1>
				</div>

				<!-- Required label + Back button -->
				<div class="relative mb-2 flex h-12 items-center justify-center text-xs text-error-500">
					{form_required()}
					<div class="absolute inset-e-0">
						<Button
							variant="outline"
							color="#000000"
							type="button"
							rounded={true}
							onclick={handleBack}
							aria-label={button_back()}
							class="h-10 w-10 min-w-0 p-0! rounded-full border-black/25 text-black hover:bg-black/8 hover:border-black/40"
						>
							<iconify-icon icon="ri:arrow-left-line" width={24} class="text-black" aria-hidden="true"></iconify-icon>
						</Button>
					</div>
				</div>

				<!-- --------------------------------------------------------- -->
				<!-- Sign In form                                               -->
				<!-- FIX: Hidden (not just absent) when 2FA panel is active    -->
				<!-- --------------------------------------------------------- -->
				{#if !P_WFORGOT && !P_WRESET && !P_WMAGIC}
					<div class:hidden={requires2FA}>
						<form
							method="POST"
							action="?/signIn"
							onsubmit={handleLoginSubmit}
							id="signin-form"
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
							<button type="submit" class="hidden" aria-hidden="true">Sign in</button>
						</form>

						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
							<div class="flex w-full flex-col sm:flex-row justify-between gap-2 sm:w-auto">
								<Button
									type="button"
									variant="surface"
									class="w-full sm:w-auto"
									aria-label={form_signin()}
									data-testid="signin-submit"
									loading={isSubmitting || isAuthenticating}
									onclick={handleLoginSubmit}
								>
									{form_signin()}
								</Button>

								<OauthLogin showGoogleOAuth={pageData.showGoogleOAuth} showGithubOAuth={pageData.showGithubOAuth} {firstCollectionPath} />
							</div>

							<div class="mt-4 flex w-full justify-between sm:mt-0 sm:w-auto gap-2">
								{#if pageData.showPasskey}
								<Button
									type="button"
									variant="outline"
									class="w-full sm:w-auto text-black!"
									aria-label="Sign in with Passkey"
									onclick={handlePasskeySignIn}
									loading={isPasskeyLoading}
								>
									Passkey
								</Button>
								{/if}
								{#if pageData.showMagicLink}
								<Button
									type="button"
									variant="outline"
									class="w-full sm:w-auto text-black!"
									aria-label="Sign in via Magic Link"
									onclick={() => { P_WMAGIC = true; }}
								>
									Magic Link
								</Button>
								{/if}
								<Button
									type="button"
									variant="outline"
									class="w-full sm:w-auto text-black!"
									aria-label={signin_forgottenpassword()}
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
									<Input
										type="text"
										id="twofa-code"
										bind:value={twoFACode}
										oninput={handle2FAInput}
										onkeydown={(e) => e.key === "Enter" && submitTwoFA()}
										placeholder={useBackupCode ? "Enter backup code" : twofa_code_placeholder()}
										aria-label={useBackupCode ? "Backup recovery code" : "Authenticator code"}
										class="text-center font-mono tracking-wider {!useBackupCode ? 'text-2xl' : 'text-lg'}"
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
									<Button
										variant="ghost"
										type="button"
										onclick={toggle2FACodeType}
										class="text-sm underline"
										aria-label={useBackupCode ? twofa_use_authenticator() : twofa_use_backup_code()}
									>
										{useBackupCode ? twofa_use_authenticator() : twofa_use_backup_code()}
										</Button>
								</div>

								<div class="flex gap-3">
									<Button variant="surface"
										type="button"
										onclick={back2FAToLogin}
										aria-label={button_back()}
									 class="flex-1">
										<iconify-icon icon="mdi:arrow-left" width={20} class="me-2" aria-hidden="true"></iconify-icon>
										{button_back()}
									</Button>

									<Button variant="tertiary"
																				type="button"
																				onclick={submitTwoFA}
																				disabled={!twoFACode.trim() ||
																					isVerifying2FA ||
																					(!useBackupCode && twoFACode.length !== 6) ||
																					(useBackupCode && twoFACode.length < 8)}
																				aria-label={twofa_verify_button()}
																			 class="flex-1">
										{#if isVerifying2FA}
											<!-- FIX: alt="" + aria-hidden on spinner image -->
											<img src="/Spinner.svg" alt="" aria-hidden="true" class="me-2 h-5 invert filter" />
											{twofa_verifying()}
										{:else}
											<iconify-icon icon="mdi:check" width={20} class="me-2" aria-hidden="true"></iconify-icon>
											{twofa_verify_button()}
										{/if}
									</Button>
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

						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-start">
							<Button variant="surface"
								type="submit"
								aria-label={form_resetpassword()}
							 class="text-white w-full sm:w-auto">
								{form_resetpassword()}
								{#if isSubmitting}
									<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ms-4 h-6 invert filter" />
								{/if}
							</Button>

							<Button variant="surface"
								type="button"
								aria-label="Back to sign in"
								onclick={() => { P_WFORGOT = false; P_WRESET = false; }}
								class="p-0! min-w-0 rounded-full">
								<iconify-icon icon="mdi:arrow-left-circle" width={24} aria-hidden="true"></iconify-icon>
							</Button>
						</div>
					</form>
				{/if}

				<!-- --------------------------------------------------------- -->
				<!-- Magic Link request form                                   -->
				<!-- --------------------------------------------------------- -->
				{#if P_WMAGIC}
					<form
						onsubmit={handleMagicSubmit}
						bind:this={magicFormElement}
						class="flex w-full flex-col gap-3"
						class:hide={active !== 0}
						inert={active !== 0}
						aria-label="Request magic link"
					>
						<FloatingInput
							id="emailmagic"
							name="email"
							type="email"
							autocomplete="email"
							autocapitalize="none"
							spellcheck={false}
							bind:value={magicForm.data.email}
							label={email()}
							required
							icon="mdi:email"
							invalid={!!magicForm.errors.email}
							errorMessage={magicForm.errors.email?.[0] || ''}
						/>

						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-start">
							<Button variant="surface"
								type="submit"
								aria-label="Send Magic Link"
								class="text-white w-full sm:w-auto">
								Send Magic Link
								{#if isSubmitting}
									<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ms-4 h-6 invert filter" />
								{/if}
							</Button>

							<Button variant="surface"
								type="button"
								aria-label="Back to sign in"
								onclick={() => { P_WMAGIC = false; }}
								class="p-0! min-w-0 rounded-full">
								<iconify-icon icon="mdi:arrow-left-circle" width={24} aria-hidden="true"></iconify-icon>
							</Button>
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

						<div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-start">
							<Button variant="surface"
								type="submit"
								aria-label={signin_savenewpassword()}
							 class="mt-6 text-white w-full sm:w-auto">
								{signin_savenewpassword()}
								{#if isSubmitting}
									<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ms-4 h-6" />
								{/if}
							</Button>

							<Button variant="surface"
								type="button"
								aria-label={button_back()}
								onclick={() => { P_WFORGOT = false; P_WRESET = false; }}
							 class="p-0! min-w-0">
								<iconify-icon icon="mdi:arrow-left-circle" width={24} aria-hidden="true"></iconify-icon>
							</Button>
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
		transition: opacity 0.25s ease-out;
	}
	section {
		--width: 0%;
		flex-grow: 1;
		width: var(--width);
		background: white;
		transition: width 0.15s ease-out, border-radius 0.15s ease-out;
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
