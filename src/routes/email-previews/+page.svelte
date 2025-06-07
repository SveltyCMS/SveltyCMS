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
	import PreviewInterface from 'svelte-email-tailwind/preview/PreviewInterface.svelte';
	export let data;
</script>

<PreviewInterface {data} email="info@svelteycms.com" />
