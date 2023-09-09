<script lang="ts">
	import type { PageData, SubmitFunction } from '../$types';

	import { superForm } from 'sveltekit-superforms/client';
	import SuperDebug from 'sveltekit-superforms/client/SuperDebug.svelte';

	import { loginFormSchema, forgotFormSchema, resetFormSchema } from '@src/utils/formSchemas';

	import SigninIcon from './icons/SigninIcon.svelte';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';
	import { PUBLIC_SITENAME } from '$env/static/public';
	import CMSLogo from './icons/Logo.svelte';

	// skeleton
	import { Toast, getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	import type { ToastSettings } from '@skeletonlabs/skeleton';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	let showPassword = false;

	export let active: undefined | 0 | 1 = undefined;
	export const show = false;
	export let PWforgot: boolean = false;
	export let PWreset: boolean = false;

	export let FormSchemaLogin: PageData['loginForm'];
	const { form, constraints, allErrors, errors, enhance, delayed } = superForm(FormSchemaLogin, {
		validators: loginFormSchema,
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		defaultValidator: 'keep',
		applyAction: true,
		taintedMessage: '',

		onSubmit: ({ cancel }) => {
			// Submit email as lowercase only
			$form.email = $form.email.toLowerCase();

			//console.log('onSubmit:', form);

			// handle login form submission
			if ($allErrors.length > 0) cancel();
		},

		onResult: ({ result, cancel }) => {
			// handle SignIn form result
			if (result.type == 'redirect') {
				// Trigger the toast
				const t = {
					message: $LL.LOGIN_SignInSuccess(),
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 2000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				return;
			}
			cancel();

			// add wiggle animation to form element
			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);
		}
	});

	export let FormSchemaForgot: PageData['forgotForm'];
	const {
		form: forgotForm,
		constraints: forgotConstraints,
		allErrors: forgotAllErrors,
		errors: forgotErrors,
		enhance: forgotEnhance,
		delayed: forgotDelayed
	} = superForm(FormSchemaForgot, {
		validators: forgotFormSchema,
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		defaultValidator: 'keep',
		applyAction: true,
		taintedMessage: '',

		onSubmit: ({ cancel }) => {
			// Submit email as lowercase only
			$forgotForm.email = $forgotForm.email.toLowerCase();

			console.log('onSubmit:', forgotForm);

			// handle login form submission
			if ($allErrors.length > 0) cancel();
		},

		onResult: ({ result, cancel }) => {
			console.log('onResult:', result); // log the result object
			console.log('onResult Type:', result.type); // log the error messages type

			// handle forgot form result
			if (result.type === 'error') {
				console.log('onResult error:', allErrors); // log the error messages

				// Transform the array of error messages into a single string
				let errorMessages = '';
				forgotAllErrors.subscribe((errors) => {
					errorMessages = errors.map((error) => error.messages.join(', ')).join('; ');
				});

				// Trigger the toast
				const t = {
					message: errorMessages,
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 2000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				return;
			}

			if (result.type === 'success') {
				console.log('onResult success'); // log success message

				// update variables to display reset form page
				PWreset = true;

				// Trigger the toast
				const t = {
					message: 'Password reset token was send by Email',
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 2000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				return;
			}

			console.log('onResult cancel'); // log cancel message
			cancel();

			// add wiggle animation to form element
			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);
		}
	});

	export let FormSchemaReset: PageData['resetForm'];
	const {
		form: resetForm,
		constraints: resetConstraints,
		allErrors: resetAllErrors,
		errors: resetErrors,
		enhance: resetEnhance,
		delayed: resetDelayed
	} = superForm(FormSchemaReset, {
		validators: resetFormSchema,
		// Clear form on success.
		resetForm: true,
		// Prevent page invalidation, which would clear the other form when the load function executes again.
		invalidateAll: false,
		// other options
		defaultValidator: 'keep',
		applyAction: true,
		taintedMessage: '',

		onSubmit: ({ cancel }) => {
			// handle login form submission
			if ($allErrors.length > 0) cancel();
			console.log('onResult error:', forgotAllErrors); // log the error messages
		},

		onResult: ({ result, cancel }) => {
			console.log('onResult:', result); // log the result object

			if (result.type === 'error') {
				console.log('onResult error:', allErrors); // log the error messages

				// Extract and format error messages
				let errorMessages = '';
				allErrors.subscribe((errors) => {
					errorMessages = errors.map((error) => error.messages.join(', ')).join('; ');
				});

				// Trigger the toast
				const t = {
					message: errorMessages,
					background: 'variant-filled-primary',
					timeout: 2000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			} else if (result.type === 'success') {
				console.log('onResult success'); // log success message

				// update variables to display reset form
				PWreset = true;

				// Trigger the toast
				const t = {
					message: 'Password reset token was sent by Email',
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 2000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			} else if (result.type === 'redirect') {
				console.log('onResult redirect'); // log redirect message

				// update variables to display reset form
				PWreset = true;

				// Trigger the toast
				// TODO: Toast in conflict with wiggle
				const t = {
					message: 'Password reset token was sent by Email',
					// Provide any utility or variant background style:
					background: 'variant-filled-primary',
					timeout: 2000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			}

			console.log('onResult cancel'); // log cancel message
			cancel();

			// add wiggle animation to form element (only if result type is not "success" or "redirect")
			formElement.classList.add('wiggle');
			setTimeout(() => formElement.classList.remove('wiggle'), 300);
		}
	});

	let formElement: HTMLFormElement;
</script>

<Toast />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<section
	on:click
	on:pointerenter
	on:keydown
	class="hover relative flex items-center"
	class:active={active == 0}
	class:inactive={active !== undefined && active !== 0}
	class:hover={active == undefined || active == 1}
>
	<div class="mx-auto mb-[5%] mt-[15%] w-full p-4 lg:w-1/2" class:hide={active != 0}>
		<div class="mb-1 flex flex-row gap-2">
			<CMSLogo className="w-12" fill="red" />

			<h1 class="text-3xl font-bold text-black lg:text-4xl">
				<div class="text-xs text-surface-300">{PUBLIC_SITENAME}</div>
				{#if !PWforgot && !PWreset}
					<div class="lg:-mt-1">{$LL.LOGIN_SignIn()}</div>
				{:else if PWforgot && !PWreset}
					<div class="text-2xl lg:-mt-1 lg:text-4xl">{$LL.LOGIN_ForgottenPassword()}</div>
				{:else if PWforgot && PWreset}
					<div class="lg:-mt-1">{$LL.LOGIN_ResetPassword()}</div>
				{/if}
			</h1>
		</div>

		<div class="-mt-2 text-right text-xs text-error-500">{$LL.LOGIN_Required()}</div>

		<!-- Sign In -->
		{#if !PWforgot && !PWreset}
			<!--<SuperDebug data={$form} />-->
			<form method="post" action="?/signIn" use:enhance bind:this={formElement} class="flex w-full flex-col gap-3" class:hide={active != 0}>
				<!-- Email field -->
				<FloatingInput
					name="email"
					type="email"
					bind:value={$form.email}
					label={$LL.LOGIN_EmailAddress()}
					{...$constraints.email}
					icon="mdi:email"
					iconColor="black"
					textColor="black"
				/>
				{#if $errors.email}<span class="invalid text-xs text-error-500">{$errors.email}</span>{/if}

				<!-- Password field -->
				<FloatingInput
					name="password"
					type="password"
					bind:value={$form.password}
					{...$constraints.password}
					bind:showPassword
					label={$LL.LOGIN_Password()}
					icon="mdi:lock"
					iconColor="black"
					textColor="black"
				/>
				{#if $errors.password}<span class="invalid text-xs text-error-500">{$errors.password}</span>{/if}

				<div class="mt-4 flex items-center justify-between">
					<button type="submit" class="variant-filled-surface btn">
						{$LL.LOGIN_SignIn()}
						<!-- Loading indicators -->
						{#if $delayed}
							<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />
						{/if}
					</button>

					<button
						type="button"
						class="variant-ringed-surface btn text-black"
						on:click={() => {
							PWforgot = true;
							PWreset = false;
						}}
						>{$LL.LOGIN_ForgottenPassword()}
					</button>
				</div>
			</form>
		{/if}

		<!-- Forgotten Password -->
		{#if PWforgot && !PWreset}
			<!-- <SuperDebug data={$forgotForm} /> -->

			<form method="post" action="?/forgotPW" use:forgotEnhance bind:this={formElement} class="flex w-full flex-col gap-3">
				<div class="mb-2 text-center text-sm text-black">
					<p class="mb-2 text-xs text-tertiary-500">{$LL.LOGIN_ForgottenPassword_text()}</p>
				</div>
				<!-- Email field -->
				<FloatingInput
					name="email"
					type="email"
					bind:value={$forgotForm.email}
					required
					label={$LL.LOGIN_EmailAddress()}
					icon="mdi:email"
					iconColor="black"
					textColor="black"
				/>
				{#if $forgotErrors.email}
					<span class="invalid text-xs text-error-500">
						{$forgotErrors.email}
					</span>
				{/if}

				{#if $forgotAllErrors && !$forgotErrors.email}
					<span class="invalid text-xs text-error-500">
						{$forgotAllErrors}
					</span>
				{/if}

				<div class="mt-4 flex items-center justify-between">
					<button type="submit" class="variant-filled-surface btn">
						{$LL.LOGIN_SendResetMail()}
					</button>

					<!-- Loading indicators -->
					{#if $forgotDelayed}
						<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />
					{/if}

					<!-- back button  -->
					<!-- TODO: Add Superforms reset -->
					<button
						type="button"
						class="variant-filled-surface btn-icon"
						on:click={() => {
							PWforgot = false;
							PWreset = false;
						}}
					>
						<iconify-icon icon="mdi:arrow-left-circle" width="38" />
					</button>
				</div>
			</form>
		{/if}

		<!-- Reset Password -->
		{#if PWforgot && PWreset}
			<SuperDebug data={$resetForm} />
			<form method="post" action="?/resetPW" use:resetEnhance bind:this={formElement} class="flex w-full flex-col gap-3">
				<!-- Password field -->
				<FloatingInput
					name="password"
					type="password"
					bind:value={$resetForm.password}
					bind:showPassword
					label={$LL.LOGIN_Password()}
					icon="mdi:lock"
					iconColor="black"
					textColor="black"
				/>
				{#if $resetErrors.password}
					<span class="invalid text-xs text-error-500">
						{$resetErrors.password}
					</span>
				{/if}

				<!-- Password  Confirm field -->
				<FloatingInput
					name="confirm_password"
					type="password"
					bind:value={$resetForm.confirm_password}
					bind:showPassword
					label={$LL.LOGIN_ConfirmPassword()}
					icon="mdi:lock"
					iconColor="black"
					textColor="black"
				/>
				{#if $resetErrors.confirm_password}
					<span class="invalid text-xs text-error-500">
						{$resetErrors.confirm_password}
					</span>
				{/if}

				<!-- Registration Token -->
				<FloatingInput
					type="password"
					bind:value={$resetForm.token}
					bind:showPassword
					label={$LL.LOGIN_Token()}
					icon="mdi:lock"
					iconColor="black"
					textColor="black"
				/>

				{#if $resetErrors.token}
					<span class="invalid text-xs text-error-500">
						{$resetErrors.token}
					</span>
				{/if}

				{#if $resetAllErrors && !$resetErrors}
					<span class="invalid text-xs text-error-500">
						{$resetAllErrors}
					</span>
				{/if}

				<button type="submit" class="variant-filled-surface btn ml-2 mt-6">
					{$LL.LOGIN_ResetPasswordSave()}
					<!-- Loading indicators -->
					{#if $resetDelayed}
						<img src="/Spinner.svg" alt="Loading.." class="ml-4 h-6" />
					{/if}
				</button>
			</form>
		{/if}
	</div>

	<SigninIcon show={active == 1 || active == undefined} />
</section>

<style lang="postcss">
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
