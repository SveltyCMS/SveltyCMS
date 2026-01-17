<!--
@file src/widgets/custom/Email/Display.svelte
@component
**Email Widget Display Component**

Renders email addresses as clickable mailto links with hover states and accessibility.
Part of the Three Pillars Architecture for Swidget system.

@example
<EmailDisplay value="user@example.com" />
Renders: <a href="mailto:user@example.com">user@example.com</a> 

### Props
- `value: string | null | undefined` - Email address string to display

### Features
- **Clickable Links**: Automatic mailto: link generation for email clients
- **Accessibility**: Descriptive title attributes for screen readers
- **Hover States**: Visual feedback with color transitions on interaction
- **Null Handling**: Graceful fallback to "–" for missing email addresses
- **Clean Styling**: Professional link appearance with underline and blue colors
- **Email Client Integration**: Opens user's default email application when clicked
- **Responsive Design**: Consistent appearance across different screen sizes
-->

<script lang="ts">
	const { value }: { value: string | null | undefined } = $props();
</script>

{#if value}
	<a href="mailto:{value}" class="email-link" title="Send email to {value}">{value}</a>
{:else}
	<span>–</span>
{/if}

<style>
	.email-link {
		color: #007bff;
		text-decoration: underline;
	}
	.email-link:hover {
		color: #0056b3;
	}
</style>
