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

{#if value}
	<a href="tel:{value}" class="tel-link" title="Call {value}">{value}</a>
{:else}
	<span>–</span>
{/if}

<style>
	.tel-link {
		color: #007bff;
		text-decoration: underline;
	}
	.tel-link:hover {
		color: #0056b3;
	}
</style>
