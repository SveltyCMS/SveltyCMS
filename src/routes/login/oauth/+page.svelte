<script lang="ts">
	import type { PageData } from './$types';

	// Components
	import Loading from '@components/Loading.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let data: PageData;

	// Use data here, for example for conditional rendering:
	let isLoading = true;

	if (data) {
		isLoading = false;
		// Process or display data
	}
</script>

<div class="grid h-full w-full place-items-center bg-[#242728]">
	{#if isLoading}
		<Loading />
	{:else}
		<form class="card m-2 flex flex-col items-center gap-2 rounded border p-2 sm:p-6" method="post">
			<!-- CSS Logo -->
			<SveltyCMSLogoFull />

			<!-- Input Token -->
			<label>
				<h2 class="mb-2 text-center text-xl font-bold text-primary-500">{m.oauth_entertoken()}</h2>
				<input placeholder={m.oauth_placeholder()} class="input" type="text" name="token" minlength="16" maxlength="48" />
			</label>
			<div class="mt-2 flex w-full justify-between gap-1 sm:gap-2">
				<!-- Cancel Button -->
				<button class="variant-filled btn">{m.button_cancel()}</button>

				<!-- Submit Button -->
				<button type="submit" class="variant-filled btn items-center">
					<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-1" />
					<p>{m.oauth_signup()}</p>
				</button>
			</div>
		</form>
	{/if}
</div>
