<!--
@file src/components/ui/radio-item.svelte
@component
**SveltyCMS Radio Item — used inside RadioGroup**

A single radio button item that communicates with its parent RadioGroup
via Svelte context. Supports default, card, and button visual variants.

### Props
- `value` (string): The value this radio item represents (required).
- `label` (string): Display label for this radio item.
- `description` (string): Optional helper text displayed below the label.
- `disabled` (boolean): Disables this specific radio item (overrides group).
- `class` (string): Additional CSS classes.

### Accessibility Features (WCAG 3.0)
- `role="radio"` with `aria-checked` on the interactive element
- Keyboard navigable: Arrow keys cycle within the radiogroup
- 24px minimum touch target on all sizes
- Focus ring with 3:1 minimum contrast ratio
- Respects `prefers-reduced-motion`

### Features:
- receives group state from RadioGroup context (name, value, variant, size)
- card variant for rich selectable tiles
- button variant for toolbar/toggle-button style
- full Svelte 5 runes: $props, $derived, getContext
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import { getContext } from 'svelte';
	import type { RadioGroupContext } from './radio-group.svelte';

	interface Props {
		value: string;
		label?: string;
		description?: string;
		disabled?: boolean;
		class?: string;
	}

	let {
		value: itemValue,
		label,
		description,
		disabled: itemDisabled = false,
		class: className = ''
	}: Props = $props();

	const ctx = getContext<RadioGroupContext>('RADIO_GROUP');
	if (!ctx && typeof window !== 'undefined') {
		console.warn('[RadioItem] Must be used inside a <RadioGroup> component.');
	}

	const checked = $derived(ctx?.value === itemValue);
	const isDisabled = $derived(itemDisabled || ctx?.disabled || false);
	const variant = $derived(ctx?.variant ?? 'default');
	const size = $derived(ctx?.size ?? 'md');

	const sizeTokens = $derived.by(() => {
		switch (size) {
			case 'sm': return { circle: 'size-4', icon: '8', text: 'text-xs', touch: 'min-h-[24px] min-w-[24px]' };
			case 'lg': return { circle: 'size-6', icon: '14', text: 'text-base', touch: 'min-h-[32px] min-w-[32px]' };
			default:   return { circle: 'size-5', icon: '10', text: 'text-sm', touch: 'min-h-[28px] min-w-[28px]' };
		}
	});

	function handleSelect() {
		if (isDisabled) return;
		ctx?.selectValue(itemValue);
	}
</script>

{#if variant === 'card'}
	<!-- Card variant: entire card is clickable -->
	<button
		type="button"
		role="radio"
		aria-checked={checked}
		disabled={isDisabled}
		class={cn(
			'flex items-start gap-3 w-full rounded border-2 p-4 text-start transition-all',
			checked
				? 'border-tertiary-500 dark:border-primary-500 bg-primary-50 dark:bg-primary-500/10 shadow-sm'
				: 'border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 hover:border-surface-300 dark:hover:border-surface-600',
			ctx?.invalid && 'border-error-500!',
			isDisabled && 'opacity-50 cursor-not-allowed',
			!isDisabled && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2',
			className
		)}
		onclick={handleSelect}
		onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleSelect(); }}}
	>
		<span
			class={cn(
				'shrink-0 inline-flex items-center justify-center rounded-full border-2 transition-all',
				sizeTokens.circle,
				sizeTokens.touch,
				checked ? 'border-tertiary-500 dark:border-primary-500' : 'border-surface-300 dark:border-surface-600',
			)}
			aria-hidden="true"
		>
			{#if checked}
				<span class="size-1/2 rounded-full bg-tertiary-500 dark:bg-primary-500 animate-in zoom-in duration-150"></span>
			{/if}
		</span>
		<span class="flex flex-col gap-0.5">
			{#if label}
				<span class={cn('font-medium text-surface-900 dark:text-surface-100', sizeTokens.text)}>{label}</span>
			{/if}
			{#if description}
				<span class="text-xs text-surface-500 dark:text-surface-400">{description}</span>
			{/if}
		</span>
	</button>
{:else if variant === 'button'}
	<!-- Button variant: compact toggle-button style -->
	<button
		type="button"
		role="radio"
		aria-checked={checked}
		disabled={isDisabled}
		class={cn(
			'inline-flex items-center justify-center px-4 py-2 rounded border-2 font-medium transition-all',
			sizeTokens.text,
			sizeTokens.touch,
			checked
				? 'border-tertiary-500 dark:border-primary-500 bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300'
				: 'border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-700 dark:text-surface-300 hover:border-surface-300 dark:hover:border-surface-600',
			isDisabled && 'opacity-50 cursor-not-allowed',
			!isDisabled && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
			className
		)}
		onclick={handleSelect}
		onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleSelect(); }}}
	>
		{#if label}{label}{:else}{itemValue}{/if}
	</button>
{:else}
	<!-- Default variant: inline radio button -->
	<label
		class={cn(
			'inline-flex items-center gap-2.5 select-none',
			isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
			className
		)}
	>
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			disabled={isDisabled}
			class={cn(
				'shrink-0 inline-flex items-center justify-center rounded-full border-2 transition-all',
				sizeTokens.circle,
				sizeTokens.touch,
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-900',
				checked ? 'border-tertiary-500 dark:border-primary-500' : 'border-surface-300 dark:border-surface-600 hover:border-primary-400',
				ctx?.invalid && 'border-error-500!',
				isDisabled && 'cursor-not-allowed'
			)}
			onclick={handleSelect}
			onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleSelect(); }}}
		>
			{#if checked}
				<span class="size-1/2 rounded-full bg-tertiary-500 dark:bg-primary-500 animate-in zoom-in duration-150"></span>
			{/if}
		</button>
		<span class="flex flex-col gap-0.5">
			{#if label}
				<span class={cn('font-medium text-surface-900 dark:text-surface-100', sizeTokens.text)}>{label}</span>
			{/if}
			{#if description}
				<span class="text-xs text-surface-500 dark:text-surface-400">{description}</span>
			{/if}
		</span>
	</label>
{/if}
