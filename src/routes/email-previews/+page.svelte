<!--
@file src/routes/email-previews/+page.svelte
@component
**Email Preview Page**

Lists the email templates under `src/components/emails` and renders the
selected template from server-rendered HTML. The page deliberately imports no
previewer package: the previous dynamic import pulled Shiki (syntax
highlighting) into the client bundle even for the default render view.

@example
/email-previews?email=welcome-user

### Props
- `data` {PageData} - `files`/`path` listing plus `previewHtml` for the selected template

### Features
- Zero previewer JS on the default page load (HTML is rendered in `+page.server.ts`)
- Sandboxed `iframe srcdoc` preview (no scripts, no same-origin access)
- Responsive template list with logical-property borders and token-based focus rings
-->

<script lang="ts">
	import type { PageData } from './$types';

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

<div
	class="min-h-screen bg-surface-500/10 text-surface-900 dark:bg-surface-900 dark:text-surface-50"
>
	<header class="border-b border-surface-500/20 px-4 py-4">
		<div class="mx-auto max-w-7xl">
			<h1 class="text-xl font-semibold">Email Previews</h1>
			<p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
				Templates from <code class="rounded bg-surface-500/10 px-1 py-0.5"
					>{data.path ?? 'src/components/emails'}</code
				>. Rendered on the server; the preview runs in a sandboxed iframe.
			</p>
		</div>
	</header>

	<div class="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
		{#if files.length}
			<nav aria-label="Email templates" class="min-w-0">
				<ul class="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
					{#each files as file (file)}
						{@const isSelected = file === selectedEmail}
						<li class="shrink-0 lg:shrink">
							<a
								href="?email={encodeURIComponent(file)}"
								data-preload="hover"
								aria-current={isSelected ? 'page' : undefined}
								class="flex min-h-10 items-center rounded-md border-s-2 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 {isSelected
									? 'border-primary-500 bg-primary-500/10 font-medium text-primary-500 dark:text-primary-400'
									: 'border-transparent hover:bg-surface-500/10'}"
							>
								<span class="truncate text-start">{file}</span>
							</a>
						</li>
					{/each}
				</ul>
			</nav>

			<section aria-label="Email preview" class="min-w-0">
				{#if previewHtml}
					<div class="overflow-hidden rounded-lg border border-surface-500/30 bg-white shadow-xs">
						<iframe
							title="Preview of {selectedEmail}"
							srcdoc={previewHtml}
							sandbox=""
							class="h-[70vh] w-full lg:h-[calc(100vh-13rem)]"
						></iframe>
					</div>
				{:else if previewError}
					<div class="rounded-lg border border-error-500/30 bg-error-500/10 p-4 text-error-500">
						<p class="font-medium">Failed to render {selectedEmail ?? 'the template'}</p>
						<pre class="mt-2 text-xs whitespace-pre-wrap">{previewError}</pre>
					</div>
				{:else}
					<div
						class="rounded-lg border border-surface-500/30 p-8 text-center text-surface-500 dark:text-surface-400"
					>
						<p>Select a template to preview it.</p>
					</div>
				{/if}
			</section>
		{:else}
			<div
				class="rounded-lg border border-surface-500/30 p-8 text-center text-surface-500 dark:text-surface-400 lg:col-span-2"
			>
				<p>
					No email templates found in
					<code class="rounded bg-surface-500/10 px-1 py-0.5"
						>{data.path ?? 'src/components/emails'}</code
					>.
				</p>
			</div>
		{/if}
	</div>
</div>
