<script lang="ts">
/**
 * @file src/routes/forbidden/+page.svelte
 * @description Dedicated "Access Denied" page for authenticated users with insufficient permissions.
 * Includes data-testid="access-denied" for reliable E2E testing.
 */
import { page } from "$app/state";
</script>
<svelte:head>
	<title>Access Denied | SveltyCMS</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-surface-50 p-4 text-center dark:bg-surface-900">
	<div class="card variant-filled-surface w-full max-w-md p-8 shadow-xl border border-surface-500/10" data-testid="access-denied">
		<div class="mb-6 flex justify-center">
			<div class="rounded-full bg-error-500/20 p-6 flex items-center justify-center">
				<iconify-icon icon="mdi:shield-alert-outline" class="text-7xl text-error-500"></iconify-icon>
			</div>
		</div>

		<h1 class="h1 mb-3 font-bold tracking-tight">Access Denied</h1>
		<p class="mb-8 text-lg text-surface-600 dark:text-surface-300 leading-relaxed">
			You do not have the necessary permissions to access this page. 
			Please contact your system administrator if you believe this is an error.
		</p>

		<div class="flex flex-col gap-3">
			<a href="/" class="btn variant-filled-primary py-3 flex items-center justify-center gap-2 font-semibold">
				<iconify-icon icon="mdi:view-dashboard-outline" class="text-xl"></iconify-icon>
				Back to Dashboard
			</a>

			<a href="/login" class="btn variant-soft-surface py-2 flex items-center justify-center gap-2">
				<iconify-icon icon="mdi:account-switch-outline" class="text-xl"></iconify-icon>
				Sign in with a different account
			</a>
		</div>

		{#if page.url.pathname !== '/forbidden'}
			<div class="mt-10 border-t border-surface-500/20 pt-6 text-xs font-mono text-surface-500/80">
				<span class="block uppercase tracking-wider mb-1 opacity-50">Attempted Access</span>
				<code class="break-all rounded bg-surface-500/10 px-2 py-1">{page.url.pathname}</code>
			</div>
		{/if}
	</div>

	<div class="mt-8 text-surface-400 text-sm">
		&copy; {new Date().getFullYear()} SveltyCMS. All rights reserved.
	</div>
</div>
