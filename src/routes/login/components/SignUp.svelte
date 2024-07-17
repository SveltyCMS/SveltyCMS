<script lang="ts">
	import { privateEnv } from '@root/config/private';
	import type { PageData } from '../$types';
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	function handleBack() {
		dispatch('back');
	}

	import { page } from '$app/stores';
	import { superForm } from 'sveltekit-superforms/client';
	import { signUpFormSchema } from '@utils/formSchemas';
	import { zod } from 'sveltekit-superforms/adapters';

	import SiteName from '@components/SiteName.svelte';
	import SignupIcon from './icons/SignupIcon.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import PasswordStrength from '@src/components/PasswordStrength.svelte';
	import * as m from '@src/paraglide/messages';

	export let active: undefined | 0 | 1 = undefined;
	export let FormSchemaSignUp: PageData['signUpForm'];

	let tabIndex = 1;
	const activeOauth = false;
	let response: any;
	const pageData = $page.data as PageData;
	let firstUserExists = pageData.firstUserExists;

	const { form, constraints, allErrors, errors, enhance, delayed } = superForm(FormSchemaSignUp, {
		id: 'signup',
		validators: firstUserExists ? zod(signUpFormSchema) : zod(signUpFormSchema.innerType().omit({ token: true })),
		resetForm: true,
		invalidateAll: false,
		applyAction: true,
		taintedMessage: '',
		multipleSubmits: 'prevent',

		onSubmit: ({ cancel }) => {
			if ($allErrors.length > 0) cancel();
		},

		onResult: ({ result, cancel }) => {
			if (result.type == 'redirect') return;
			cancel();

			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);

			if (result.type == 'success') {
				response = result.data?.message;
			}
		}
	});

	const params = new URL(window.location.href).searchParams;

	if (params.has('regToken')) {
		active = 1;
		firstUserExists = false;
		$form.token = params.get('regToken')!;
	}

	let formElement: HTMLFormElement;
	let showPassword = false;

	function goBack() {
		active = undefined;
	}

	$: passwordStrength = $form.password || '';
	$: confirmPasswordStrength = $form.confirm_password || '';
</script>

<section
	on:click
	on:pointerenter
	on:keydown
	class="hover relative flex items-center overflow-y-auto"
	class:active={active == 1}
	class:inactive={active !== undefined && active !== 1}
	class:hover={active == undefined || active == 0}
>
	{#if active == 1}
		<div class="hidden xl:block"><SveltyCMSLogoFull /></div>

		<div class="mx-auto mb-[5%] mt-[15%] w-full p-4 lg:w-1/2" class:hide={active != 1}>
			<div class="mb-4 flex flex-row gap-2">
				<SveltyCMSLogo class="w-14" fill="red" />

				<h1 class="text-3xl font-bold text-white lg:text-4xl">
					<div class="text-xs text-surface-300"><SiteName /></div>
					<div class="break-words lg:-mt-1">
						{m.form_signup()}
						{#if !firstUserExists}
							<span class="text-2xl text-primary-500 sm:text-3xl">: Admin</span>
						{:else}
							<span class="text-2xl capitalize text-primary-500 sm:text-3xl">: New User</span>
						{/if}
					</div>
				</h1>
			</div>

			<div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500">
				{m.form_required()}

				<button on:click|stopPropagation={handleBack} class="variant-outline-secondary btn-icon">
					<iconify-icon icon="ri:arrow-left-line" width="20" class="text-white"></iconify-icon>
				</button>
			</div>

			<form method="post" action="?/signUp" use:enhance bind:this={formElement} class="items flex flex-col gap-3" class:hide={active != 1}>
				<FloatingInput
					id="usernamesignUp"
					name="username"
					type="text"
					tabindex={tabIndex++}
					required
					bind:value={$form.username}
					label={m.form_username()}
					{...$constraints.username}
					icon="mdi:user-circle"
					iconColor="white"
					textColor="white"
					inputClass="text-white"
					autocomplete="on"
				/>
				{#if $errors.username}<span class="text-xs text-error-500">{$errors.username}</span>{/if}

				<FloatingInput
					id="emailsignUp"
					name="email"
					type="email"
					tabindex={tabIndex++}
					required
					bind:value={$form.email}
					label={m.form_emailaddress()}
					{...$constraints.email}
					icon="mdi:email"
					iconColor="white"
					textColor="white"
					inputClass="text-white"
					autocomplete="on"
				/>
				{#if $errors.email}<span class="text-xs text-error-500">{$errors.email}</span>{/if}

				<FloatingInput
					id="passwordsignUp"
					name="password"
					type="password"
					tabindex={tabIndex++}
					required
					bind:value={$form.password}
					bind:showPassword
					label={m.form_password()}
					{...$constraints.password}
					icon="mdi:password"
					iconColor="white"
					textColor="white"
					showPasswordBackgroundColor="dark"
					inputClass="text-white"
					autocomplete="on"
				/>
				{#if $errors.password}
					<span class="text-xs text-error-500">{$errors.password}</span>
				{/if}

				<PasswordStrength password={$form.password} />

				<FloatingInput
					id="confirm_passwordsignUp"
					name="confirm_password"
					type="password"
					tabindex={tabIndex++}
					required
					bind:value={$form.confirm_password}
					bind:showPassword
					label={m.form_confirmpassword()}
					{...$constraints.confirm_password}
					icon="mdi:password"
					iconColor="white"
					textColor="white"
					showPasswordBackgroundColor="dark"
					inputClass="text-white"
					autocomplete="on"
				/>
				{#if $errors.confirm_password}
					<span class="text-xs text-error-500">{$errors.confirm_password}</span>
				{/if}

				<PasswordStrength password={$form.confirm_password} />

				{#if firstUserExists == true}
					<FloatingInput
						id="tokensignUp"
						name="token"
						type="password"
						tabindex={tabIndex++}
						required
						bind:value={$form.token}
						label={m.signup_registrationtoken()}
						{...$constraints.token}
						icon="mdi:key-chain"
						iconColor="white"
						textColor="white"
						showPasswordBackgroundColor="dark"
						inputClass="text-white"
						autocomplete="off"
					/>
					{#if $errors.token}
						<span class="text-xs text-error-500">{$errors.token}</span>
					{/if}
				{/if}

				{#if response}
					<span class="text-xs text-error-500">{response}</span>
				{/if}

				{#if privateEnv.USE_GOOGLE_OAUTH === false}
					<button type="submit" class="variant-filled btn mt-4 uppercase">
						{m.form_signup()}
						{#if $delayed}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
					</button>
				{:else if privateEnv.USE_GOOGLE_OAUTH === true && !activeOauth}
					<div class="btn-group mt-4 border border-secondary-500 text-white [&>*+*]:border-secondary-500">
						<button type="submit" class="btn w-3/4 bg-surface-200 text-black hover:text-white">
							<span class="w-full text-black hover:text-white">{m.form_signup()}</span>
							{#if $delayed}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
						</button>
						<form method="post" action="?/OAuth" class="w-1/4">
							<button type="submit" class="btn flex w-full items-center justify-center">
								<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-0.5 sm:mr-2" />
								<span class="">OAuth</span>
							</button>
						</form>
					</div>
				{/if}
			</form>
		</div>
	{/if}

	<SignupIcon show={active == 0 || active == undefined} />
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
