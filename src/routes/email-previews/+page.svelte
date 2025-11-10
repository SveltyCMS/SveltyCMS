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
</script>

{#if data.emails}
	<EmailPreview emailList={{ ...data, files: data.emails?.map((e) => e.path) || null, path: '/src/components/emails' }} />
{/if}
