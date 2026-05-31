<!-- 
@file src/routes/email-previews/+page.svelte
@component
**Email Preview Page**
- Lazy-loads the previewer to prevent SSR crashes and reduce bundle size.
- Uses Svelte's {#await} block for cleaner async handling.

@example
<EmailPreview />

### Props
- `data` {object} - Object containing user data

### Features
- Displays widgets for previewing email templates
-->

<script lang="ts">
import { browser } from "$app/environment";
import type { PageData } from "./$types";

// props
interface Props {
	data: PageData;
}

const { data }: Props = $props();

// Use $derived to ensure reactivity
const emailList = $derived({
	...data,
	path: data.path ?? null,
});
</script>

{#if emailList.files && emailList.files.length}
	{#if browser}
		{#await import('@better-svelte-email/preview')}
			<!-- Loading State -->
			<div class="flex h-full items-center justify-center p-10">
				<div class="text-center">
					<div class="mb-2 text-xl font-semibold">Loading Previewer...</div>
					<p class="text-sm text-surface-500">Fetching email templates</p>
				</div>
			</div>
		{:then module}
			<!-- Resolved State - Dynamic component with any typing for third-party module -->
			{@const EmailPreviewComponent = module.EmailPreview as any}
			<EmailPreviewComponent {emailList} />
		{:catch error}
			<!-- Error State -->
			<div class="rounded border border-error-200 bg-error-50 p-4 text-error-500">
				<p class="font-bold">Failed to load email previewer</p>
				<pre class="mt-2 text-xs">{error.message}</pre>
			</div>
		{/await}
	{/if}
{:else}
	<div class="p-8 text-center text-surface-500">
		<p>No email templates found in <code class="rounded bg-surface-100 px-1 py-0.5">/src/components/emails</code>.</p>
	</div>
{/if}
