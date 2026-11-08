<!--
@file src/routes/(app)/email-previews/+page.svelte
@component
**Email Preview Page**

Lists the email templates under `src/components/emails` and renders the
selected template from server-rendered HTML. The page deliberately imports no
previewer package: the previous dynamic import pulled Shiki (syntax
highlighting) into the client bundle even for the default render view.

The route lives inside the `(app)` group so it inherits the admin shell
(sidebar, header, back navigation) — it is reached from Config → Email
Previews and previously rendered as a bare standalone page.

@example
/email-previews?email=welcome-user

### Props
- `data` {PageData} - `files`/`path` listing plus `previewHtml` for the selected template

### Features
- Zero previewer JS on the default page load (HTML is rendered in `+page.server.ts`)
- Sandboxed `iframe srcdoc` preview (no scripts, no same-origin access)
- Full content width: the template list is fixed, the preview takes the rest
- Responsive template list with logical-property borders and token-based focus rings
-->

<script lang="ts">
	import type { PageData } from './$types';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';

	interface Props {
		data: PageData;
	}

	const { data }: Props = $props();

	const files = $derived(data.files ?? []);
	const selectedEmail = $derived(
		typeof data.selectedEmail === 'string' ? data.selectedEmail : null
	);
	const previewHtml = $derived(typeof data.previewHtml === 'string' ? data.previewHtml : null);
	const previewError = $derived(typeof data.previewError === 'string' ? data.previewError : null);
</script>

<svelte:head>
	<title>Email Previews · SveltyCMS</title>
</svelte:head>

<AdminPageShell
	title="Email Previews"
	icon="mdi:email-outline"
	highlight="Previews"
	description="Templates from {data.path ??
		'src/components/emails'} — rendered on the server; the preview runs in a sandboxed iframe."
	showBackButton={true}
	backUrl="/config"
	fullHeight={true}
>
	<div
		class="grid min-h-0 w-full flex-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]"
		data-testid="email-previews-layout"
	>
		{#if files.length}
			<AdminCard class="min-h-0 overflow-hidden p-2" data-testid="email-previews-list">
				<nav aria-label="Email templates" class="h-full min-h-0">
					<ul
						class="flex h-full min-h-0 gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-y-auto lg:pb-0"
					>
						{#each files as file (file)}
							{@const isSelected = file === selectedEmail}
							<li class="shrink-0 lg:shrink">
								<a
									href="?email={encodeURIComponent(file)}"
									data-preload="hover"
									aria-current={isSelected ? 'page' : undefined}
									class="flex min-h-10 items-center rounded-md border-s-2 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--admin-focus-ring) {isSelected
										? 'border-primary-500 bg-primary-500/10 font-medium text-primary-500 dark:text-primary-400'
										: 'border-transparent text-(--admin-text-body) hover:bg-surface-500/10'}"
								>
									<span class="truncate text-start">{file}</span>
								</a>
							</li>
						{/each}
					</ul>
				</nav>
			</AdminCard>

			<AdminCard
				class="flex min-h-0 flex-col overflow-hidden p-0"
				data-testid="email-previews-frame"
			>
				{#if previewHtml}
					<iframe
						title="Preview of {selectedEmail}"
						srcdoc={previewHtml}
						sandbox=""
						class="min-h-[70vh] w-full flex-1 border-0 bg-white lg:min-h-0"
					></iframe>
				{:else if previewError}
					<div class="p-4">
						<div class="rounded-lg border border-error-500/30 bg-error-500/10 p-4 text-error-500">
							<p class="font-medium">Failed to render {selectedEmail ?? 'the template'}</p>
							<pre class="mt-2 text-xs whitespace-pre-wrap">{previewError}</pre>
						</div>
					</div>
				{:else}
					<div
						class="p-8 text-center text-sm text-(--admin-text-muted) lg:flex lg:h-full lg:items-center lg:justify-center"
					>
						<p>Select a template to preview it.</p>
					</div>
				{/if}
			</AdminCard>
		{:else}
			<AdminCard class="col-span-full p-8 text-center text-sm text-(--admin-text-muted)">
				<p>
					No email templates found in
					<code class="rounded bg-surface-500/10 px-1 py-0.5"
						>{data.path ?? 'src/components/emails'}</code
					>.
				</p>
			</AdminCard>
		{/if}
	</div>
</AdminPageShell>
