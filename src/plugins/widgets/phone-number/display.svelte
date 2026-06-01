<!--
@file src/widgets/custom/PhoneNumber/Display.svelte
@component
**PhoneNumber Widget Display Component**

Renders phone numbers as clickable tel: links for direct calling functionality.
Part of the Three Pillars Architecture for wSidget system.

@example
<PhoneNumberDisplay value="+49 30 12345678" />
Renders: <a href="tel:+49 30 12345678">+49 30 12345678</a>

### Props
- `value: string | null | undefined` - Phone number string to display

### Features
- **Clickable Links**: Automatic tel: link generation for phone applications
- **Mobile Integration**: Opens native dialer app on mobile devices
- **Accessibility**: Descriptive title attributes for screen readers
- **Hover States**: Visual feedback with color transitions on interaction
- **Null Handling**: Graceful fallback to "–" for missing phone numbers
- **Clean Styling**: Professional link appearance with blue colors and underline
- **PostCSS Styling**: Modern CSS with utility-first approach
- **Cross-platform**: Works with desktop and mobile calling applications
-->

<script lang="ts">
	const { value }: { value: string | null | undefined } = $props();
</script>

<div class="phone-display inline-flex items-center gap-1.5">
	{#if value}
		<iconify-icon icon="mdi:phone-outline" width="16" class="text-surface-400 dark:text-surface-500"></iconify-icon>
		<a 
			href="tel:{value.replace(/\s/g, '')}" 
			class="text-tertiary-600 dark:text-primary-600 dark:text-primary-500 hover:underline font-medium transition-colors"
			title="Call: {value}"
		>
			{value}
		</a>
	{:else}
		<span class="text-surface-400 dark:text-surface-600">–</span>
	{/if}
</div>

<style>
	.phone-display {
		font-family: inherit;
		letter-spacing: -0.01em;
	}
</style>
