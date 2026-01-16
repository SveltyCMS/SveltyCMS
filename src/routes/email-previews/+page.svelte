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
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	export let data: PageData;

	// Prepare the data structure required by EmailPreview
	const emailList = {
		...data,
		path: data.path ?? null
	};
</script>

{#if emailList.files && emailList.files.length}
	{#if browser}
		{#await import('better-svelte-email/preview')}
			<!-- Loading State -->
			<div class="flex h-full items-center justify-center p-10">
				<div class="text-center">
					<div class="mb-2 text-xl font-semibold">Loading Previewer...</div>
					<p class="text-sm text-gray-500">Fetching email templates</p>
				</div>
			</div>
		{:then module}
			<!-- Resolved State -->
			<svelte:component this={module.EmailPreview} {...emailList} {page} />
		{:catch error}
			<!-- Error State -->
			<div class="rounded border border-red-200 bg-red-50 p-4 text-red-500">
				<p class="font-bold">Failed to load email previewer</p>
				<pre class="mt-2 text-xs">{error.message}</pre>
			</div>
		{/await}
	{/if}
{:else}
	<div class="p-8 text-center text-gray-500">
		<p>No email templates found in <code class="rounded bg-gray-100 px-1 py-0.5">/src/components/emails</code>.</p>
	</div>
{/if}
