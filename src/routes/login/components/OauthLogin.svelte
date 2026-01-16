<!--
@files src/routes/login/components/OauthLogin.svelte
@component
**OauthLogin - This component displays a form for logging in with OAuth.**

### Props
- `showOAuth`: boolean

### Features
- Displays a form for logging in with OAuth
-->

<script lang="ts">
	// Show OAuth when OAuth is enabled and an admin has sent an invitation
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	const { showOAuth = true } = $props();
</script>

{#if publicEnv?.USE_GOOGLE_OAUTH === true && showOAuth}
	<form id="oauth-login" action="?/signInOAuth" method="post" class="flex flex-col items-center justify-center">
		<button form="oauth-login" type="submit" aria-label="OAuth" class="btn preset-filled-surface-500-800 w-full text-white sm:w-auto">
			<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1"></iconify-icon>
			<p>OAuth</p>
		</button>
	</form>
{/if}
