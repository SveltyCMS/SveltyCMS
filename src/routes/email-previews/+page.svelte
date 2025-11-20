<!-- 
@file src/routes/email-previews/+page.svelte
@component
**This file sets up and displays the email preview page. It provides a user-friendly interface for previewing email templates.**

@example   
<EmailPreview />

### Props
- `data` {object} - Object containing user data

### Features
- Displays widgets for previewing email templates
-->

<script lang="ts">
	import { EmailPreview } from 'better-svelte-email/preview';
	import type { PageData } from './$types';

	export let data: PageData;

	// `emailList` already returns the structure EmailPreview expects,
	// including `path`, `files` (string[]), and any extra metadata.
	const emailList = {
		...data,
		path: data.path ?? null // Ensure path is string or null, not undefined
	};
</script>

{#if emailList.files && emailList.files.length}
	<EmailPreview {emailList} />
{:else}
	<p>No email templates found in /src/components/emails.</p>
{/if}
