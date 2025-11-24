<script lang="ts">
	// Toast component - compatibility wrapper
	// This provides a simple container for toast notifications
	import { browser } from '$app/environment';
	import { getToastStore } from '../skeleton-compat';
	
	const toastStore = browser ? getToastStore() : null;
</script>

{#if browser && toastStore}
	<div class="toast-container fixed top-4 right-4 z-50 flex flex-col gap-2">
		{#each $toastStore as toast (toast.id)}
			<div class="toast bg-surface-900 dark:bg-surface-100 text-surface-50 dark:text-surface-900 p-4 rounded shadow-lg max-w-sm">
				<div class="toast-title font-semibold">{toast.title}</div>
				{#if toast.description}
					<div class="toast-description text-sm mt-1">{toast.description}</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
