<script lang="ts">
	import type { PageData } from '../$types';
	import { superForm } from 'sveltekit-superforms/client';
	// import SuperDebug from 'sveltekit-superforms/client/SuperDebug.svelte';
	// import { dev } from '$app/environment';

	import SignupIcon from './icons/SignupIcon.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	let tabIndex = 1;

	import { PUBLIC_SITENAME, PUBLIC_USE_GOOGLE_OAUTH } from '$env/static/public';

	let activeOauth = false;

	import CMSLogo from './icons/Logo.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { signUpFormSchema } from '@utils/formSchemas';

	export let active: undefined | 0 | 1 = undefined;
	export let FormSchemaSignUp: PageData['signUpForm'];

	let response: any;
	let firstUserExists = FormSchemaSignUp.data.token != null;

	const { form, constraints, allErrors, errors, enhance, delayed } = superForm(FormSchemaSignUp, {
		id: 'signup',
		//validators: (firstUserExists ? signUpFormSchema.omit({ token: true }) : signUpFormSchema) as typeof signUpFormSchema,

		validators: (firstUserExists ? signUpFormSchema : signUpFormSchema.innerType().omit({ token: true })) as typeof signUpFormSchema,

		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		defaultValidator: 'clear',
		applyAction: true,
		taintedMessage: '',

		onSubmit: ({ cancel }) => {
			// handle login form submission
			// console.log('Submitting form with data:', $form);
			// console.log('Form errors:', $allErrors);
			if ($allErrors.length > 0) cancel();
		},

		onResult: ({ result, cancel }) => {
			console.log('Form result:', result);
			//console.log('Error', $errors)

			if (result.type == 'redirect') return;
			cancel();

			// add wiggle animation to form element
			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);

			if (result.type == 'success') {
				response = result.data?.message;
			}
		}
	});

	// $: console.log('Form data:', $form);
	// $: console.log('Form errors:', $errors);

	let params = new URL(window.location.href).searchParams;

	if (params.has('regToken')) {
		active = 1;
		firstUserExists = false;
		// update token value
		$form.token = params.get('regToken')!;
	}

	let formElement: HTMLFormElement;

	// TODO: Replace Role with the one assigned by token
	let UserRole = 'User';

	let showPassword = false;
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<section
	on:click
	on:pointerenter
	on:keydown
	class="hover relative flex items-center overflow-hidden"
	class:active={active == 1}
	class:inactive={active !== undefined && active !== 1}
	class:hover={active == undefined || active == 0}
>
	<div class="mx-auto mb-[5%] mt-[15%] w-full p-4 lg:w-1/2" class:hide={active != 1}>
		<div class="mb-4 flex flex-row gap-2">
			<CMSLogo className="w-12" fill="red" />

			<h1 class="text-3xl font-bold text-white lg:text-4xl">
				<div class="text-xs text-surface-300">{PUBLIC_SITENAME}</div>
				<div class="break-words lg:-mt-1">
					{m.signup_signup()}
					{#if !firstUserExists}
						<span class="text-2xl text-primary-500 sm:text-3xl">: Admin</span>
					{:else}
						<!-- TODO: Grab User Role from Token  -->
						<span class="text-2xl text-primary-500 sm:text-3xl"
							>{#if UserRole}: {UserRole}{:else}: New User{/if}</span
						>
					{/if}
				</div>
			</h1>
		</div>

		<div class="-mt-2 text-right text-xs text-error-500">{m.signup_required()}</div>

		<!-- <SuperDebug data={$form} display={dev} /> -->

		<form method="post" action="?/signUp" use:enhance bind:this={formElement} class="items flex flex-col gap-3" class:hide={active != 1}>
			<!-- Username field -->
			<FloatingInput
				name="username"
				type="text"
				tabindex={tabIndex++}
				required
				bind:value={$form.username}
				label={m.signup_username()}
				{...$constraints.username}
				icon="mdi:user-circle"
				iconColor="white"
				textColor="white"
				inputClass="text-white"
			/>
			{#if $errors.username}<span class="text-xs text-error-500">{$errors.username}</span>{/if}

			{#if PUBLIC_USE_GOOGLE_OAUTH}
				<!-- Email field -->
				<FloatingInput
					name="email"
					type="email"
					tabindex={tabIndex++}
					required
					bind:value={$form.email}
					label={m.signup_emailaddess()}
					{...$constraints.email}
					icon="mdi:email"
					iconColor="white"
					textColor="white"
					inputClass="text-white"
				/>
				{#if $errors.email}<span class="text-xs text-error-500">{$errors.email}</span>{/if}

				<!-- TODO Check PW & Check to show hide PW together and have matching PW -->
				<!-- Password field -->
				<FloatingInput
					name="password"
					type="password"
					tabindex={tabIndex++}
					required
					bind:value={$form.password}
					bind:showPassword
					label={m.signup_password()}
					{...$constraints.password}
					icon="mdi:password"
					iconColor="white"
					textColor="white"
					showPasswordBackgroundColor="dark"
					inputClass="text-white"
				/>
				{#if $errors.password}<span class="text-xs text-error-500">{$errors.password}</span>{/if}

				<!-- Password Confirm -->
				<FloatingInput
					name="confirm_password"
					type="password"
					tabindex={tabIndex++}
					required
					bind:value={$form.confirm_password}
					bind:showPassword
					label={m.signup_confirmpassword()}
					{...$constraints.confirm_password}
					icon="mdi:password"
					iconColor="white"
					textColor="white"
					showPasswordBackgroundColor="dark"
					inputClass="text-white"
				/>
				{#if $errors.confirm_password}<span class="text-xs text-error-500">{$errors.confirm_password}</span>{/if}
			{/if}

			{#if $form.token != null}
				<!-- Registration Token -->
				<FloatingInput
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
				/>
				{#if $errors.token}<span class="text-xs text-error-500">{$errors.token}</span>{/if}
			{/if}

			{#if response}<span class="text-xs text-error-500">{response}</span>{/if}
			<!-- <input type="hidden" name="lang" value={$systemLanguage} /> -->

			{#if PUBLIC_USE_GOOGLE_OAUTH === 'false'}
				<!-- email signin only -->
				<button type="submit" class="variant-filled btn mt-4 uppercase"
					>{m.signup_signup()}
					<!-- Loading indicators -->
					{#if $delayed}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
				</button>

				<!-- email + oauth signin  -->
			{:else if PUBLIC_USE_GOOGLE_OAUTH === 'true' && !activeOauth}
				<div class="variant-ghost-secondary btn-group mt-4 [&>*+*]:border-error-500">
					<button type="submit" class="col-2 variant-filled w-3/4 text-center uppercase">
						<span class="text-black">{m.signup_signup()} </span>
						<!-- Loading indicators -->
						{#if $delayed}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
					</button>
					<form method="post" action="?/OAuth" class="w-fit">
						<!-- <input type="hidden" name="lang" value={$systemLanguage} /> -->
						<button type="submit" class="uppercase">
							<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-2" />
							<span>OAuth</span>
						</button>
					</form>
				</div>
			{:else}
				<!-- TODO: not really used -->
				<form method="post" action="?/OAuth" class="flex w-full">
					<button type="submit" class="items center variant-filled my-2 flex flex-1 justify-center gap-2 p-3 uppercase">
						<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1" />
						<p>Sign Up with Google</p>
						<!-- <p>{m.signup_signupwithgoogle()}</p>-->
					</button>
				</form>
			{/if}
		</form>
	</div>

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
