<!-- 
@src/routes/login/oauth/+page.svelte
@description OAuth login page 
-->

<script lang="ts">
	import type { PageData } from './$types';

	// Components
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	// Stores
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		data: PageData;
	}

	const { data }: Props = $props();

	let token = $state('');
	let formError = $state('');
	let isFormValid = $state(false);

	// Update form validation when token changes
	$effect(() => {
		isFormValid = !data.requiresToken || (token.length >= 16 && token.length <= 48);
	});

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
				<h2 class="mb-2 text-center text-xl font-bold text-primary-500">
					{m.oauth_entertoken()}
				</h2>
				<FloatingInput
					id="token"
					name="token"
					type="text"
					required
					bind:value={token}
					label={m.registration_token?.() || m.signup_registrationtoken?.()}
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
			<p id="error-message" class="text-error-500" role="alert">
				{formError}
			</p>
		{/if}

		<div class="mt-2 flex w-full justify-between gap-1 sm:gap-2">
			<!-- Cancel Button -->
			<button type="button" onclick={handleCancel} aria-label={m.button_cancel()} class="preset-filled btn">
				{m.button_cancel()}
			</button>

			<!-- Submit Button -->
			<button
				type="submit"
				disabled={!isFormValid || globalLoadingStore.isLoading}
				aria-label={m.button_send()}
				class="preset-filled btn items-center"
			>
				<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-1"></iconify-icon>
				<p>{m.oauth_signup()}</p>
			</button>
		</div>
	</form>
</div>
