<!--
@file src/components/system/RestartRequiredBanner.svelte
@component
**Displays a banner when a server restart is required in SveltyCMS**

### Features:
- Warns users that a server restart is needed for changes to take effect.
- Provides a button to trigger server restart via API.
- Shows success or error toast notifications based on restart outcome.
- Accessible, visually distinct warning and action button.
-->

<script lang="ts">
	import { toaster } from '@stores/store.svelte';

	async function restartServer() {
		try {
			const response = await fetch('/api/system/restart', { method: 'POST' });
			if (response.ok) {
				toaster.success({ description: 'Server is restarting...' });
			} else {
				const data = await response.json();
				toaster.error({ description: data.error || 'Failed to restart server' });
			}
		} catch (error) {
			toaster.error({ description: 'Failed to restart server' });
		}
	}
</script>

<div class="preset-filled-warning-500 p-4 text-center">
	<p class="font-bold">A server restart is required for some changes to take effect.</p>
	<button class="preset-filled-error-500 btn mt-2" on:click={restartServer}>Restart Now</button>
</div>
