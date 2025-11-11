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
	import { showToast } from '@utils/toast';

	async function restartServer() {
		try {
			const response = await fetch('/api/system/restart', { method: 'POST' });
			if (response.ok) {
				showToast('Server is restarting...', 'success');
			} else {
				const data = await response.json();
				showToast(data.error || 'Failed to restart server', 'error');
			}
		} catch (error) {
			showToast('Failed to restart server', 'error');
		}
	}
</script>

<div class="bg-warning-500 text-white p-4 text-center">
	<p class="font-bold">A server restart is required for some changes to take effect.</p>
	<button class="bg-error-500 text-white btn mt-2" on:click={restartServer}>Restart Now</button>
</div>
