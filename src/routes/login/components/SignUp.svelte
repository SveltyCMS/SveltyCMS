<script lang="ts">
	import type { PageData, SubmitFunction } from '../$types';
	import { superForm } from 'sveltekit-superforms/client';
	import SuperDebug from 'sveltekit-superforms/client/SuperDebug.svelte';

	import SignupIcon from './icons/SignupIcon.svelte';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';
	let tabIndex = 1;

	import { PUBLIC_SITENAME } from '$env/static/public';
	import CMSLogo from './icons/Logo.svelte';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	import { signUpFormSchema } from '@src/utils/formSchemas';

	export let active: undefined | 0 | 1 = undefined;

	export let FormSchemaSignUp: PageData['signUpForm'];

	let response: any;
	let firstUserExists = FormSchemaSignUp.data.token != null;

	const { form, constraints, allErrors, errors, enhance, delayed } = superForm(FormSchemaSignUp, {
		id: 'signup',
		validators: (firstUserExists
			? signUpFormSchema
			: signUpFormSchema.innerType().omit({ token: true })) as typeof signUpFormSchema,
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
			if ($allErrors.length > 0) cancel();
		},

		onResult: ({ result, cancel }) => {
			//console.log('onResult', result);
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
	class="hover relative flex items-center"
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
					{$LL.LOGIN_SignUp()}
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

		<div class="-mt-2 text-right text-xs text-error-500">{$LL.LOGIN_Required()}</div>

		<!--<SuperDebug data={$form} />-->
		<form
			method="post"
			action="?/signUp"
			use:enhance
			bind:this={formElement}
			class="items flex flex-col gap-3"
			class:hide={active != 1}
		>
			<!-- Username field -->
			<FloatingInput
				name="username"
				type="text"
				tabindex={tabIndex++}
				required
				bind:value={$form.username}
				label={$LL.LOGIN_Username()}
				{...$constraints.username}
				icon="mdi:user-circle"
				iconColor="white"
				textColor="white"
				inputClass="text-white"
			/>
			{#if $errors.username}<span class="text-xs text-error-500">{$errors.username}</span>{/if}

			<!-- Email field -->
			<FloatingInput
				name="email"
				type="email"
				tabindex={tabIndex++}
				required
				bind:value={$form.email}
				label={$LL.LOGIN_EmailAddress()}
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
				label={$LL.LOGIN_Password()}
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
				label={$LL.LOGIN_ConfirmPassword()}
				{...$constraints.confirm_password}
				icon="mdi:password"
				iconColor="white"
				textColor="white"
				showPasswordBackgroundColor="dark"
				inputClass="text-white"
			/>
			{#if $errors.confirm_password}<span class="text-xs text-error-500"
					>{$errors.confirm_password}</span
				>{/if}

			{#if $form.token != null}
				<!-- Registration Token -->
				<FloatingInput
					name="token"
					type="password"
					tabindex={tabIndex++}
					required
					bind:value={$form.token}
					label={$LL.LOGIN_Token()}
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

			<button type="submit" class="variant-filled btn mt-4 uppercase"
				>{$LL.LOGIN_SignUp()}
				<!-- Loading indicators -->
				{#if $delayed}<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />{/if}
			</button>
		</form>

		<!-- TODO: Fix transition to signIn -->
		<!-- <p class="text-center text-sm text-surface-300">
			Already have an account?
			
			<button type="button" on:click={() => (active = 0)} class="btn text-tertiary-500">
				{$LL.LOGIN_SignIn()}
			</button>
		</p> -->
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
