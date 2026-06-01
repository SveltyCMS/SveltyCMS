<!--
@file src/components/ui/date-picker.svelte
@component
**SveltyCMS DatePicker — WCAG 3.0 Ready**

Native date input wrapper with label, min/max constraints, calendar icon overlay,
and transparent browser indicator trick for consistent cross-browser appearance.

### Props
- `value` (string): Bindable ISO date/time string.
- `type` ('date' | 'datetime-local' | 'time'): Input type (default: 'date').
- `label` (string): Label text above the input.
- `min` / `max` (string): Date/time range constraints.
- `disabled` (boolean): Disable interaction.
- `required` (boolean): Mark as required for form validation.
- `error` (string): Error message with red border and alert text.
- `description` (string): Helper text below the input.
- `class` (string): Additional CSS classes.
- `onchange` (function): Callback with new date/time string.

### Features:
- native `<input type="date">` for maximum platform accessibility
- decorative calendar icon with focus-animation
- cross-browser calendar picker indicator transparency
- full Svelte 5 runes: $props, $bindable, $derived
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Props {
	value?: string;
	type?: 'date' | 'datetime-local' | 'time';
	label?: string;
	min?: string;
	max?: string;
	disabled?: boolean;
	required?: boolean;
	error?: string;
	description?: string;
	class?: string;
	onchange?: (value: string) => void;
}

let {
	value = $bindable(''),
	type = 'date',
	label,
	min,
	max,
	disabled = false,
	required = false,
	error = '',
	description = '',
	class: className = '',
	onchange
}: Props = $props();

const id = globalThis.crypto?.randomUUID?.() ?? `date-${Math.random().toString(36).slice(2, 9)}`;
const errorId = $derived(error ? `${id}-error` : undefined);
const descriptionId = $derived(description ? `${id}-description` : undefined);
const describedBy = $derived([descriptionId, errorId].filter(Boolean).join(' ') || undefined);

const classes = $derived(cn(
	'input px-3 py-2 rounded-lg border transition-all duration-200 w-full',
	'bg-surface-50 dark:bg-surface-900',
	error ? 'border-error-500 focus:ring-error-500/20 focus:border-error-500' : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-tertiary-500 dark:border-primary-500',
	'focus:ring-2',
	disabled && 'opacity-50 cursor-not-allowed grayscale',
	className
));
</script>

<div class="space-y-1 w-full">
	{#if label}
		<label class="block text-sm font-bold opacity-80 pl-1" for={id}>
			{label}
		</label>
	{/if}

	<div class="relative group">
		<input
			{id}
			{type}
			bind:value
			{min}
			{max}
			{disabled}
			{required}
			aria-invalid={!!error}
			aria-describedby={describedBy}
			aria-required={required}
			class={classes}
			onchange={(e) => onchange?.(e.currentTarget.value)}
		/>

		<!-- Decorative Calendar Icon (Internal to input area if possible, or overlay) -->
		<div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-focus-within:opacity-100 transition-opacity">
		<iconify-icon icon={type === 'time' ? 'mdi:clock-outline' : 'mdi:calendar'} width="20"></iconify-icon>
		</div>
	</div>

	{#if description && !error}
		<p id={descriptionId} class="text-xs text-surface-500 dark:text-surface-400 pl-1">{description}</p>
	{/if}

	{#if error}
		<p id={errorId} class="text-xs text-error-500 font-medium pl-1" role="alert">{error}</p>
	{/if}
</div>

<style>
/* Custom styling to hide the default browser calendar icon if desired, or just style around it */
::-webkit-calendar-picker-indicator {
    background: transparent;
    bottom: 0;
    color: transparent;
    cursor: pointer;
    height: auto;
    left: 0;
    position: absolute;
    right: 30px;
    top: 0;
    width: auto;
}
</style>
