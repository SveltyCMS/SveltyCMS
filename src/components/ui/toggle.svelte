<!--
@file src/components/ui/toggle.svelte
@component
**SveltyCMS Toggle Switch — WCAG 3.0 Ready**

* iOS-style toggle switch with three sizes, label, description, and
* `role="switch"` with `aria-checked` for maximum screen reader support.
*
* The off state is **neutral**, not red: "off" is not an error. The brand ramp
* marks on, and the thumb carries the state by position (plus an optional icon
* pair) instead of the old ON/OFF text, which forced a thumb large enough to
* make every switch look like a primary button.

### Props
- `value` (boolean): Bindable toggle state.
- `label` (string): Label text next to the toggle.
- `ariaLabel` (string): Accessible name for the switch when no visible `label` is rendered.
- `description` (string): Helper text below the label.
- `size` ('sm' | 'md' | 'lg'): Size variant.
- `iconOn` / `iconOff` (string): Iconify icons for each state.
- `disabled` (boolean): Disable interaction.
- `class` (string): Additional CSS classes.
- `onToggle` (function): Callback with new boolean state.

### Features:
- WCAG 3.0 ready with `role="switch"`, `aria-checked`, and `<label>` association
- neutral (off) / brand (on) track, no error red for a normal off state
- sm/md/lg sizes with proportional thumb and optional icons
- full Svelte 5 runes: $props, $bindable, $derived
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import { generateId } from '@utils/id-generator';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		value?: boolean;
		label?: string;
		/** Rich label content (e.g. text + a `?` help trigger); wins over `label`. */
		labelSnippet?: Snippet;
		/** Accessible name for the switch when no visible `label` is rendered. */
		ariaLabel?: string;
		labelClass?: string;
		labelColor?: string;
		description?: string;
		disabled?: boolean;
		iconOn?: string;
		iconOff?: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
		onToggle?: (value: boolean) => void | Promise<any>;
	} & HTMLAttributes<HTMLDivElement>;

	let {
		value = $bindable(false),
		label,
		labelSnippet,
		ariaLabel,
		labelClass,
		labelColor = 'text-(--admin-text-body)',
		description,
		disabled = false,
		iconOn,
		iconOff,
		size = 'md',
		class: className,
		onToggle,
		...rest
	}: Props = $props();

	// Every size keeps a 2px inset: track width − thumb width − 2 × inset = on position.
	const sizes = {
		sm: {
			track: 'h-5 w-9 min-w-9',
			thumb: 'h-4 w-4',
			translateOn: 'translate-x-[18px]',
			translateOff: 'translate-x-[2px]',
			icon: '12'
		},
		md: {
			track: 'h-6 w-11 min-w-11',
			thumb: 'h-5 w-5',
			translateOn: 'translate-x-[22px]',
			translateOff: 'translate-x-[2px]',
			icon: '14'
		},
		lg: {
			track: 'h-7 w-[52px] min-w-[52px]',
			thumb: 'h-6 w-6',
			translateOn: 'translate-x-[26px]',
			translateOff: 'translate-x-[2px]',
			icon: '18'
		}
	};

	function toggle() {
		if (disabled) return;
		value = !value;
		if (onToggle) onToggle(value);
	}

	const id = generateId('toggle');
</script>

<div class={cn('flex gap-3 items-start md:items-center', className)} {...rest}>
	<div class="relative flex h-full items-center">
		<input
			aria-label={ariaLabel || label || 'Toggle switch'}
			type="checkbox"
			class="peer sr-only"
			bind:checked={value}
			{disabled}
			{id}
			onchange={() => onToggle?.(value)}
		/>
		<button
			type="button"
			class={cn(
				'pointer-events-auto relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-surface-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-surface-300 dark:ring-offset-surface-950',
				sizes[size].track,
				value ? 'bg-tertiary-500 dark:bg-primary-500' : 'bg-surface-500/40 dark:bg-surface-600'
			)}
			onclick={toggle}
			{disabled}
			aria-checked={value}
			aria-label={ariaLabel || label || 'Toggle switch'}
			role="switch"
		>
			<span
				class={cn(
					'pointer-events-none flex items-center justify-center rounded-full bg-white shadow-lg ring-0 transition-transform duration-200',
					sizes[size].thumb,
					// Drive the slide from the reactive value: `peer-checked:` compiles to a
					// general-sibling selector, but the thumb lives inside the track <button>
					// (not a sibling of the `peer` input), so it never matched.
					value ? sizes[size].translateOn : sizes[size].translateOff
				)}
			>
				{#if iconOn && iconOff}
					<iconify-icon
						icon={value ? iconOn : iconOff}
						width={sizes[size].icon}
						class={cn(
							value
								? 'text-tertiary-500 dark:text-primary-500'
								: 'text-surface-600 dark:text-surface-400',
							disabled && 'text-surface-600'
						)}
					></iconify-icon>
				{/if}
			</span>
		</button>
	</div>

	{#if label || labelSnippet || description}
		<div class="grid gap-1.5 leading-none">
			{#if label || labelSnippet}
				<label
					for={id}
					class={cn(
						'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
						labelColor,
						labelClass
					)}
				>
					{#if labelSnippet}
						{@render labelSnippet()}
					{:else}
						{label}
					{/if}
				</label>
			{/if}
			{#if description}
				<p class="text-sm text-(--admin-text-muted)">
					{description}
				</p>
			{/if}
		</div>
	{/if}
</div>
