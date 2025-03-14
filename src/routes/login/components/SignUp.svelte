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
	import { privateEnv } from '@root/config/private';
	import { browser } from '$app/environment';

	import type { PageData } from '../$types';

	// Stores
	import { page } from '$app/state';

	// Superforms
	// import SuperDebug from 'sveltekit-superforms/client/SuperDebug.svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import type { SignUpFormSchema } from '@utils/formSchemas';
	import type { SuperValidated } from 'sveltekit-superforms';

	// Components
	import SignupIcon from './icons/SignupIcon.svelte';
	import SiteName from '@components/SiteName.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import PasswordStrength from '@components/PasswordStrength.svelte';
	import FloatingPaths from '@root/src/components/system/FloatingPaths.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	const {
		active = $bindable(undefined),
		FormSchemaSignUp,
		onClick = () => {},
		onPointerEnter = () => {},
		onBack = () => {}
	} = $props<{
		active?: undefined | 0 | 1;
		FormSchemaSignUp: SuperValidated<SignUpFormSchema>;
		onClick?: () => void;
		onPointerEnter?: () => void;
		onBack?: () => void;
	}>();

	const pageData = page.data as PageData;
	const firstUserExists = pageData.firstUserExists;

	// State management
	let tabIndex = $state(1);
	let response = $state<any>(undefined);
	let formElement = $state<HTMLFormElement | null>(null);
	let showPassword = $state(false);

	// Pre-calculate tab indices
	const usernameTabIndex = 1;
	const emailTabIndex = 2;
	const passwordTabIndex = 3;
	const confirmPasswordTabIndex = 4;
	const tokenTabIndex = 5;

	// Form setup with Svelte 5 optimizations
	const { form, constraints, allErrors, errors, enhance, delayed } = superForm(FormSchemaSignUp, {
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
			}
		},

		onResult: ({ result, cancel }) => {
			if (result.type == 'redirect') {
				return;
			}
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

	// Derived form values
	const formValues = $derived({
		username: $form.username || '',
		email: $form.email || '',
		password: $form.password || '',
		confirm_password: $form.confirm_password || '',
		token: $form.token || ''
	});

	// URL parameter handling
	const params = browser ? new URL(window.location.href).searchParams : new URLSearchParams('');

	$effect(() => {
		if (browser && params.has('regToken')) {
			$form.token = params.get('regToken')!;
		}
	});

	// Event handlers
	function handleOAuth() {
		const form = document.createElement('form');
		form.method = 'post';
		form.action = '?/OAuth';
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
			<div class="absolute inset-0">
				<FloatingPaths position={1} background="dark" mirrorAnimation />
				<FloatingPaths position={-1} background="dark" mirrorAnimation />
			</div>
			<!-- CSS Logo -->
			<div class="absolute top-[20%] left-1/2 hidden -translate-x-1/2 -translate-y-1/2 transform xl:block"><SveltyCMSLogoFull /></div>
			<div class="relative z-10 mx-auto mt-[15%] mb-[5%] w-full rounded-md bg-[#242728] p-4 lg:w-4/5" class:hide={active !== 1}>
				<div class="mb-4 flex flex-row gap-2">
					<SveltyCMSLogo className="w-14" fill="red" />

					<h1 class="text-3xl font-bold text-white lg:text-4xl">
						<div class="text-surface-300 text-xs"><SiteName /></div>
						<div class="break-words lg:-mt-1">
							{m.form_signup()}
							{#if !firstUserExists}
								<span class="text-primary-500 text-2xl sm:text-3xl">: Admin</span>
							{:else}
								<span class="text-primary-500 text-2xl capitalize sm:text-3xl">: New User</span>
							{/if}
						</div>
					</h1>
				</div>

				<!-- Required with Back button -->
				<div class="text-error-500 -mt-2 flex items-center justify-end gap-2 text-right text-xs">
					{m.form_required()}

					<button onclick={handleBack} aria-label="Back" class="preset-outline-secondary btn-icon">
						<iconify-icon icon="ri:arrow-left-line" width="20" class="text-white"></iconify-icon>
					</button>
				</div>

				<!-- <SuperDebug data={$form} display={dev} /> -->
				<form method="post" action="?/signUp" use:enhance bind:this={formElement} class="items flex flex-col gap-3" class:hide={active !== 1}>
					<!-- Username field -->
					<FloatingInput
						id="usernamesignUp"
						name="username"
						type="text"
						tabindex={usernameTabIndex}
						required
						value={formValues.username}
						label={m.form_username()}
						{...$constraints.username}
						icon="mdi:user-circle"
						iconColor="white"
						textColor="white"
						inputClass="text-white"
						autocomplete="on"
						onInput={(value) => ($form.username = value)}
					/>
					{#if $errors.username}<span class="text-error-500 text-xs">{$errors.username}</span>{/if}

					<!-- Email field -->
					<FloatingInput
						id="emailsignUp"
						name="email"
						type="email"
						tabindex={emailTabIndex}
						required
						value={formValues.email}
						label={m.form_emailaddress()}
						{...$constraints.email}
						icon="mdi:email"
						iconColor="white"
						textColor="white"
						inputClass="text-white"
						autocomplete="on"
						onInput={(value) => ($form.email = value)}
					/>
					{#if $errors.email}<span class="text-error-500 text-xs">{$errors.email}</span>{/if}

					<!-- Password field -->
					<FloatingInput
						id="passwordsignUp"
						name="password"
						type="password"
						tabindex={passwordTabIndex}
						required
						value={formValues.password}
						{showPassword}
						label={m.form_password()}
						{...$constraints.password}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						showPasswordBackgroundColor="dark"
						inputClass="text-white"
						autocomplete="on"
						onInput={(value) => ($form.password = value)}
					/>
					{#if $errors.password}
						<span class="text-error-500 text-xs">{$errors.password}</span>
					{/if}

					<!-- Password Confirm -->
					<FloatingInput
						id="confirm_passwordsignUp"
						name="confirm_password"
						type="password"
						tabindex={confirmPasswordTabIndex}
						required
						value={formValues.confirm_password}
						{showPassword}
						label={m.form_confirmpassword()}
						{...$constraints.confirm_password}
						icon="mdi:password"
						iconColor="white"
						textColor="white"
						showPasswordBackgroundColor="dark"
						inputClass="text-white"
						autocomplete="on"
						onInput={(value) => ($form.confirm_password = value)}
					/>
					{#if $errors.confirm_password}
						<span class="text-error-500 text-xs">{$errors.confirm_password}</span>
					{/if}

					<!-- Password Strength Indicator -->
					<PasswordStrength password={formValues.password} confirmPassword={formValues.confirm_password} />

					{#if firstUserExists == true}
						<!-- Registration Token -->
						<FloatingInput
							id="tokensignUp"
							name="token"
							type="password"
							tabindex={tokenTabIndex}
							required
							value={formValues.token}
							label={m.signup_registrationtoken()}
							{...$constraints.token}
							icon="mdi:key-chain"
							iconColor="white"
							textColor="white"
							showPasswordBackgroundColor="dark"
							inputClass="text-white"
							autocomplete="off"
							onInput={(value) => ($form.token = value)}
						/>
						{#if $errors.token}
							<span class="text-error-500 text-xs">{$errors.token}</span>
						{/if}
					{/if}

					{#if response}
						<span class="text-error-500 text-xs">{response}</span>
					{/if}

					{#if !privateEnv.USE_GOOGLE_OAUTH}
						<!-- Email SignIn only -->
						<button type="submit" class="preset-filled btn mt-4 uppercase" aria-label={m.form_signup()}>
							{m.form_signup()}
							{#if $delayed}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
						</button>

						<!-- Email + OAuth signin  -->
					{:else}
						<div class="btn-group preset-ghost-surface-500 mt-4">
							<!-- Sign Up Button -->
							<button type="submit" class="btn bg-surface-200 w-3/4 text-white hover:text-white" aria-label={m.form_signup()}>
								<span class="w-full">{m.form_signup()}</span>
								<!-- Loading indicators -->
								{#if $delayed}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
							</button>

							<!-- OAuth Button -->
							<button type="button" onclick={handleOAuth} aria-label="OAuth" class="btn flex w-1/4 items-center justify-center border">
								<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-0.5 sm:mr-2"></iconify-icon>
								<span class="">OAuth</span>
							</button>
						</div>
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
		grow: 1;
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
