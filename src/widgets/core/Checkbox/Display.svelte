<!--
@file src/widgets/core/Checkbox/Display.svelte
@component
**Checkbox Widget Display Component**

Renders checkbox values as visual indicators (checkmark or dash).
Part of the CMS widget system.

@example
<CheckboxDisplay value={true} />

#### Props
- `value: CheckboxWidgetData` - Boolean value to display

#### Features
- Visual checkmark for true values
- Dash for false/null values
- Accessible with ARIA labels
- Color-coded indicators
- Responsive sizing
-->

<script lang="ts">
	import type { CheckboxWidgetData } from './';

	interface Props {
		value: CheckboxWidgetData;
		size?: 'sm' | 'md' | 'lg';
	}

	let { value, size = 'md' }: Props = $props();

	// Size classes for icons
	const sizeClasses = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6'
	};

	const sizeClass = $derived(sizeClasses[size]);
</script>

<div class="flex h-full w-full items-center justify-center">
	{#if value}
		<!-- Checkmark Icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			class="text-success-500 {sizeClass}"
			aria-label="Checked"
			role="img"
		>
			<path d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z" />
		</svg>
	{:else}
		<!-- Dash for unchecked/null -->
		<span class="select-none text-lg text-surface-400 dark:text-surface-500" aria-label="Unchecked" role="img"> − </span>
	{/if}
</div>
