<!--
@file src/components/ui/segmented-control.svelte
@component
**SveltyCMS SegmentedControl Primitive**

### Props
- `options` (Option[]): Array of select options, containing label, value, optional icon and disabled state.
- `value` (any): Bindable selected value.
- `name` (string): Name of the control (defaults to random UUID).
- `disabled` (boolean): Disable the entire segmented control.
- `rounded` (string): Tailored rounded class (default: 'rounded-token').
- `class` (string): Additional CSS classes.
- `onchange` (function): Triggered when selection changes.

### Features:
- WCAG 3.0 compliant role="radiogroup"
- Full keyboard arrow key navigation
- Single focus target with tabindex tracking
- No nested interactive elements (uses single hidden input for forms)
-->

<script lang="ts">
import { cn } from '@utils/cn';
import type { HTMLAttributes } from 'svelte/elements';

type Option = {
	label: string;
	value: any;
	icon?: string;
	disabled?: boolean;
};

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'value' | 'onchange'> & {
	options: Option[];
	value: any;
	name?: string;
	disabled?: boolean;
	rounded?: string;
	class?: string;
	onchange?: (value: any) => void;
};

let {
	options = [],
	value = $bindable(),
	name = crypto.randomUUID(),
	disabled = false,
	rounded = 'rounded-token',
	class: className,
	onchange,
	...rest
}: Props = $props();

const segmentClasses = $derived(cn(
	'flex bg-surface-200/50 dark:bg-surface-800/50 p-1',
	rounded,
	disabled && 'opacity-50 pointer-events-none',
	className
));

let containerElement: HTMLDivElement | undefined = $state();
let activeIndex = $derived(options.findIndex(opt => opt.value === value));

function select(val: any) {
	if (disabled) return;
	value = val;
	onchange?.(val);
}

function handleKeyDown(e: KeyboardEvent, index: number) {
	if (disabled) return;
	let newIndex = index;
	if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
		e.preventDefault();
		newIndex = (index + 1) % options.length;
		let count = 0;
		while (options[newIndex]?.disabled && count < options.length) {
			newIndex = (newIndex + 1) % options.length;
			count++;
		}
	} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
		e.preventDefault();
		newIndex = (index - 1 + options.length) % options.length;
		let count = 0;
		while (options[newIndex]?.disabled && count < options.length) {
			newIndex = (newIndex - 1 + options.length) % options.length;
			count++;
		}
	} else {
		return;
	}

	if (newIndex !== index && options[newIndex] && !options[newIndex].disabled) {
		select(options[newIndex].value);
		// Focus the new button programmatically
		const buttons = containerElement?.querySelectorAll('button');
		if (buttons && buttons[newIndex]) {
			(buttons[newIndex] as HTMLButtonElement).focus();
		}
	}
}
</script>

<div
	bind:this={containerElement}
	class={segmentClasses}
	role="radiogroup"
	aria-label={rest['aria-label'] || 'Segmented Control'}
	{...rest}
>
	<input type="hidden" {name} {value}  aria-label="Input" />

	{#each options as option, i}
		{const active = value === option.value}
		{const isTabFocusable = active || (activeIndex === -1 && i === 0)}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			tabindex={isTabFocusable ? 0 : -1}
			disabled={disabled || option.disabled}
			class={cn(
				'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200',
				rounded,
				active
					? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
					: 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
			)}
			onclick={() => select(option.value)}
			onkeydown={(e) => handleKeyDown(e, i)}
		>
			{#if option.icon}
				<iconify-icon icon={option.icon} class="size-4"></iconify-icon>
			{/if}
			<span>{option.label}</span>
		</button>
	{/each}
</div>
