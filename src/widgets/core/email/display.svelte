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

<div class="email-display inline-flex items-center gap-1.5">
	{#if value}
		<iconify-icon icon="mdi:email-outline" width="16" class="text-surface-400 dark:text-surface-500"></iconify-icon>
		<a 
			href="mailto:{value}" 
			class="text-primary-600 dark:text-primary-500 hover:underline font-medium transition-colors"
			title="Email: {value}"
		>
			{value}
		</a>
	{:else}
		<span class="text-surface-400 dark:text-surface-600">–</span>
	{/if}
</div>

<style>
	.email-display {
		font-family: inherit;
		letter-spacing: -0.01em;
	}
</style>
