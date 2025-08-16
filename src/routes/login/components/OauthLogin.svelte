<script lang="ts">
	import { getGlobalSetting } from '@src/stores/globalSettings';

	// Show OAuth when OAuth is enabled and an admin has sent an invitation
	const { showOAuth = true } = $props<{
		showOAuth?: boolean;
	}>();
</script>

{#if getGlobalSetting<boolean>('USE_GOOGLE_OAUTH') === true && showOAuth}
	<form id="oauth-login" action="?/signInOAuth" method="post" class="flex flex-col items-center justify-center">
		<button form="oauth-login" type="submit" aria-label="OAuth" class="variant-filled-surface btn w-full sm:w-auto">
			<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1"></iconify-icon>
			<p>OAuth</p>
		</button>
	</form>
{/if}
