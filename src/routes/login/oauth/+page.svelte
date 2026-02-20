<!-- 
@src/routes/login/oauth/+page.svelte
@description OAuth login page 
-->

<script lang="ts">
	import FloatingInput from '@src/components/system/inputs/floating-input.svelte';
	// ParaglideJS
	import { button_cancel, button_send, oauth_entertoken, oauth_signup, registration_token, signup_registrationtoken } from '@src/paraglide/messages';
	// Stores
	import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
	import type { PageData } from './$types';

	// Components
	import SveltyCMSLogoFull from '@src/components/system/icons/svelty-cms-logo-full.svelte';

	interface Props {
		data: PageData;
	}

	const { data }: Props = $props();

	let token = $state('');
	let formError = $state('');
	const isFormValid = $derived(!data.requiresToken || (token.length >= 16 && token.length <= 48));

	// Handle form submission
	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (data.requiresToken && !isFormValid) {
			formError = 'Invalid token length';
			return;
		}

		formError = '';

		await globalLoadingStore
			.withLoading(
				loadingOperations.authentication,
				async () => {
					const form = event.target as HTMLFormElement;
					const formData = new FormData(form);
					const response = await fetch(form.action, {
						method: 'POST',
						body: formData
					});

					if (!response.ok) {
						throw new Error('OAuth authentication failed');
					}
					// Redirect will be handled by the server
				},
				'OAuth.handleSubmit'
			)
			.catch((error) => {
				formError = error instanceof Error ? error.message : 'Authentication failed';
			});
	}

	// Handle cancel button
	function handleCancel() {
		window.history.back();
	}
</script>

<div class="grid h-full w-full place-items-center bg-[#242728]">
	<form class="card m-2 flex flex-col items-center gap-2 rounded border p-2 sm:p-6" method="post" action="?/OAuth" onsubmit={handleSubmit}>
		<!-- CSS Logo -->
		<SveltyCMSLogoFull />

		{#if data.requiresToken}
			<!-- Token Input Form -->
			<label>
				<h2 class="mb-2 text-center text-xl font-bold text-primary-500">{oauth_entertoken()}</h2>
				<FloatingInput
					id="token"
					name="token"
					type="text"
					required
					bind:value={token}
					label={registration_token?.() || signup_registrationtoken?.()}
					icon="mdi:key-chain"
					iconColor="white"
					textColor="white"
					passwordIconColor="white"
					inputClass="text-white"
					autocomplete="off"
					minlength={16}
					maxlength={48}
				/>
			</label>
		{/if}

		<!-- Error Message -->
		{#if formError}
			<p id="error-message" class="text-error-500" role="alert">{formError}</p>
		{/if}

		<div class="mt-2 flex w-full justify-between gap-1 sm:gap-2">
			<!-- Cancel Button -->
			<button type="button" onclick={handleCancel} aria-label={button_cancel()} class="variant-filled btn">{button_cancel()}</button>

			<!-- Submit Button -->
			<button
				type="submit"
				disabled={!isFormValid || globalLoadingStore.isLoading}
				aria-label={button_send()}
				class="variant-filled btn items-center"
			>
				<iconify-icon icon="flat-color-icons:google" width={24}></iconify-icon>
				<p>{oauth_signup()}</p>
			</button>
		</div>
	</form>
</div>
