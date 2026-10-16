<!--
@file src/routes/(app)/+error.svelte
@component
**Authenticated Admin Area Error Boundary**

Wraps errors occurring inside the (app) layout within standard AdminPageShell and AdminCard,
preserving the administrative shell, navigation, and sidebar context.

### Props:
None (reads `page` rune from `$app/state`).

### Features:
- Preserves admin shell (sidebar, navigation, theme) without crashing into full-screen disconnect.
- Displays HTTP status badge, request path, and contextual error summary.
- Provides accessible recovery actions (Dashboard, Reload, Go Back).
- Full WCAG 2.2 AA compliance, RTL logical properties, and status-shade contract conformity.
-->

<script lang="ts">
	import { page } from '$app/state';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Button from '@components/ui/button.svelte';
	import {
		error_goback,
		error_go_dashboard,
		error_page_moved,
		error_reload_view,
		error_title_suffix
	} from '@src/paraglide/messages';
	import { resolveErrorDisplay } from '@utils/error-display';

	const status = $derived(page.status || 500);
	const errorDisplay = $derived(resolveErrorDisplay(status, page.error?.message));
</script>

<svelte:head>
	<title>{status} - {errorDisplay.title} {error_title_suffix()}</title>
</svelte:head>

<AdminPageShell
	title="{status} — {errorDisplay.title}"
	icon="material-symbols:error-outline"
	description="An error occurred while processing this administrative view."
>
	<AdminCard class="p-6 sm:p-8">
		<div class="flex flex-col items-center text-center">
			<span
				class="mb-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {status >=
				500
					? 'border border-error-500/30 bg-error-500/10 text-error-500'
					: 'border border-warning-500/30 bg-warning-500/10 text-warning-500'}"
			>
				HTTP {status}
			</span>

			<h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100 sm:text-3xl">
				{errorDisplay.title}
			</h2>

			<p class="mt-3 max-w-xl text-base text-surface-600 dark:text-surface-400">
				{errorDisplay.summary}
			</p>

			{#if page.url}
				<div
					class="mt-4 inline-flex max-w-md items-center rounded-lg border border-surface-500/20 bg-surface-500/10 px-3 py-1.5 text-xs font-mono text-surface-600 dark:text-surface-400"
				>
					<span class="truncate">{page.url.pathname}{page.url.search}</span>
				</div>
			{/if}

			{#if errorDisplay.showPageMoved}
				<p class="mt-4 text-xs text-surface-500 dark:text-surface-400">
					{error_page_moved()}
				</p>
			{/if}

			<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
				<Button variant="outline" href="/dashboard">{error_go_dashboard()}</Button>

				<Button
					variant="outline"
					onclick={() => {
						if (typeof window !== 'undefined') window.location.reload();
					}}
				>
					{error_reload_view()}
				</Button>

				<Button
					variant="outline"
					onclick={() => {
						if (typeof window !== 'undefined') window.history.back();
					}}
				>
					{error_goback()}
				</Button>
			</div>
		</div>
	</AdminCard>
</AdminPageShell>
