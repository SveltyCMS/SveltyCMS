<script lang="ts">
	import { privateEnv } from '@root/config/private';
	// State management
</script>

{#if privateEnv.USE_GOOGLE_OAUTH === true}
	<form id="oauth-login" action="?/OAuth" method="post" class="flex flex-col items-center justify-center">
		<button form="oauth-login" type="submit" aria-label="OAuth" class="preset-filled-surface-500 btn w-full text-white sm:w-auto">
			<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1"></iconify-icon>
			<p>OAuth</p>
		</button>
	</form>
{/if}
