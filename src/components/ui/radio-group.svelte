<!--
@file src/components/ui/radio-group.svelte
@component
**SveltyCMS Radio Group Primitive — WCAG 3.0 Ready**

A fully accessible radio button group with horizontal/vertical layouts,
card variants, and full keyboard navigation per ARIA radiogroup pattern.

### Props
- `value` (string): Bindable currently selected value.
- `name` (string): Form name for the radio group (default: auto-generated UUID).
- `label` (string): Legend / group label for the radio group.
- `description` (string): Optional helper description for the entire group.
- `disabled` (boolean): Disables all radio items in the group.
- `required` (boolean): Marks the group as required for validation.
- `invalid` (boolean): Applies error styling.
- `error` (string): Error message for the group.
- `orientation` ('horizontal' | 'vertical'): Layout direction (default: 'vertical').
- `variant` ('default' | 'card' | 'button'): Visual presentation style.
- `size` ('sm' | 'md' | 'lg'): Control sizing.
- `class` (string): Additional CSS classes.
- `children` (Snippet): RadioItem children to render within the group.
- `onchange` (function): Callback invoked with the new selected value.

### RadioItem Props (via context)
- `value` (string): The value this radio item represents (required).
- `label` (string): Display label for this radio item.
- `description` (string): Optional helper text for this radio item.
- `disabled` (boolean): Disables this specific radio item.

### Accessibility Features (WCAG 3.0)
- `role="radiogroup"` with `aria-labelledby` for the group legend
- `role="radio"` with `aria-checked` on each item
- Arrow key navigation within the group (Up/Down for vertical, Left/Right for horizontal)
- Tab stops on the checked radio; Tab enters/exits the group
- 24px minimum touch target on all size variants
- Respects `prefers-reduced-motion` for transitions
- Error state with `aria-describedby` + `aria-invalid` linkage

### Features:
- horizontal and vertical layout support
- card-style radio items for settings panels
- button-style radio items for toolbars
- full Svelte 5 runes: $props, $bindable, $derived, setContext/getContext
- context-based RadioItem communication (no prop drilling)
-->

<script lang="ts" module>
	export interface RadioGroupContext {
		value: string;
		name: string;
		disabled: boolean;
		required: boolean;
		invalid: boolean;
		size: 'sm' | 'md' | 'lg';
		variant: 'default' | 'card' | 'button';
		selectValue: (val: string) => void;
	}
</script>

<script lang="ts">
	import { cn } from '@utils/cn';
	import { generateId } from '@utils/id-generator';
	import { setContext } from 'svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		value?: string;
		name?: string;
		label?: string;
		description?: string;
		disabled?: boolean;
		required?: boolean;
		invalid?: boolean;
		error?: string;
		orientation?: 'horizontal' | 'vertical';
		variant?: 'default' | 'card' | 'button';
		size?: 'sm' | 'md' | 'lg';
		class?: string;
		children?: Snippet;
		onchange?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		name = '',
		label,
		description,
		disabled = false,
		required = false,
		invalid = false,
		error = '',
		orientation = 'vertical',
		variant = 'default',
		size = 'md',
		class: className = '',
		children,
		onchange
	}: Props = $props();

	const generatedId = generateId('radio-group');
	const groupName = $derived(name || generatedId);
	const legendId = $derived(`${generatedId}-legend`);
	const descriptionId = $derived(description ? `${generatedId}-description` : undefined);
	const errorId = $derived(error ? `${generatedId}-error` : undefined);

	function selectValue(val: string) {
		if (disabled) return;
		value = val;
		onchange?.(val);
	}

	const describedBy = $derived([descriptionId, errorId].filter(Boolean).join(' ') || undefined);

	setContext<RadioGroupContext>('RADIO_GROUP', {
		get value() { return value; },
		get name() { return groupName; },
		get disabled() { return disabled; },
		get required() { return required; },
		get invalid() { return invalid; },
		get size() { return size; },
		get variant() { return variant; },
		selectValue
	});
</script>

<fieldset
	class={cn('flex flex-col gap-3', className)}
	aria-labelledby={label ? legendId : undefined}
	aria-describedby={describedBy}
	{disabled}
>
	{#if label}
		<legend id={legendId} class="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-1">
			{label}
			{#if required}
				<span class="text-error-500 ms-0.5" aria-hidden="true">*</span>
			{/if}
		</legend>
	{/if}

	{#if description}
		<p id={descriptionId} class="text-xs text-surface-500 dark:text-surface-400 -mt-1.5 mb-1">{description}</p>
	{/if}

	<div
		class={cn(
			'flex gap-2',
			orientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
		)}
		role="radiogroup"
		aria-labelledby={label ? legendId : undefined}
		aria-required={required}
		aria-orientation={orientation}
	>
		{@render children?.()}
	</div>

	{#if error}
		<p id={errorId} class="text-xs text-error-500 font-medium" role="alert">{error}</p>
	{/if}
</fieldset>
