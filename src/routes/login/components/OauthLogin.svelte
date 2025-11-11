<script lang="ts">
	// Show OAuth when OAuth is enabled and an admin has sent an invitation
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	const { showOAuth = true } = $props<{
		showOAuth?: boolean;
	}>();
</script>

{#if publicEnv?.USE_GOOGLE_OAUTH === true && showOAuth}
	<form id="oauth-login" action="?/signInOAuth" method="post" class="flex flex-col items-center justify-center">
		<button form="oauth-login" type="submit" aria-label="OAuth" class="bg-surface-500 text-white btn w-full sm:w-auto">
			<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1"></iconify-icon>
			<p>OAuth</p>
		</button>
	</form>
{/if}
