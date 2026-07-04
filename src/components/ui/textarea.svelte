<!--
@file src/components/ui/textarea.svelte
@component
**SveltyCMS Textarea — WCAG 3.0 Ready**

Multi-line text input with label, error state, and AdminTheme radius integration.

### Props
- `value` (string): Bindable textarea value.
- `label` (string): Label text above the field.
- `error` (string): Error message with red border and alert text.
- `rows` (number): Visible row count (default: 4).
- `class` / `textareaClass` / `labelClass` (string): CSS classes.
- `id` (string): Custom ID (auto-generated otherwise).

### Features:
- aria-invalid and aria-describedby linkage
- --admin-radius-input from theme context
- full Svelte 5 runes
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import { generateId } from '@utils/id-generator';
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { getThemeContext } from './theme-context.svelte';

	const generatedId = generateId('textarea');

	type Props = HTMLTextareaAttributes & {
		value?: string;
		label?: string;
		labelClass?: string;
		textareaClass?: string;
		error?: string;
		class?: string;
	};

	let {
		value = $bindable(''),
		label,
		labelClass,
		textareaClass,
		error,
		class: className,
		id = generatedId,
		rows = 4,
		...rest
	}: Props = $props();

	const theme = getThemeContext();

	const baseStyles =
		'flex min-h-[80px] w-full border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 px-3 py-2 text-sm ring-offset-background placeholder:text-surface-600 dark:placeholder:text-surface-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 resize-y';

	const errorStyles = 'border-error-500 focus-visible:ring-error-500';

	const customStyles = $derived.by(() => {
		let styles = `border-radius: var(--admin-radius-input, 6px); border-width: var(--admin-border-width, 1px); `;
		const scale = theme ? theme.spacingScale : 1.0;
		if (scale !== 1.0) {
			styles += `font-size: 0.875rem; padding: ${Math.round(8 * scale)}px ${Math.round(12 * scale)}px; `;
		}
		return styles;
	});

	const errorId = $derived(error ? `${id}-error` : undefined);
</script>

<div class={cn('w-full space-y-2', className)}>
	{#if label}
		<label
			for={id}
			class={cn(
				'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
				labelClass
			)}
		>
			{label}
		</label>
	{/if}

	<textarea aria-label={label || undefined}
		{id}
		{rows}
		class={cn(baseStyles, error && errorStyles, textareaClass)}
		style={customStyles}
		bind:value
		aria-invalid={!!error}
		aria-describedby={errorId}
		{...rest}
	></textarea>

	{#if error}
		<p id={errorId} class="text-[0.8rem] font-medium text-error-500" role="alert">{error}</p>
	{/if}
</div>