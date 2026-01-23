<script lang="ts">
	// Show OAuth when OAuth is enabled and an admin has sent an invitation
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { deserialize } from '$app/forms';
	import { preloadData } from '$app/navigation';

	const { showOAuth = true } = $props();

	let prefetched = $state(false);

	async function prefetchFirstCollection() {
		if (prefetched) return;
		prefetched = true;

		try {
			const data = new FormData();
			const response = await fetch('?/prefetch', {
				method: 'POST',
				body: data
			});

			const result = deserialize(await response.text());

			if (result.type === 'success') {
				const collection = (result.data as any)?.collection;
				if (collection?.path) {
					await preloadData(collection.path);
				}
			}
		} catch (error) {
			console.error('Prefetch failed:', error);
		}
	}
</script>

{#if publicEnv?.USE_GOOGLE_OAUTH === true && showOAuth}
	<form id="oauth-login" action="?/signInOAuth" method="post" class="flex flex-col items-center justify-center">
		<button
			form="oauth-login"
			type="submit"
			aria-label="OAuth"
			class="preset-filled-surface-500 btn w-full sm:w-auto"
			onmouseenter={prefetchFirstCollection}
		>
			<iconify-icon icon="flat-color-icons:google" width={24}></iconify-icon>
			<p>OAuth</p>
		</button>
	</form>
{/if}
