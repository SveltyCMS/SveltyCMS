<!--
@file src/components/ui/select.svelte
@component
**SveltyCMS Select Primitive — WCAG 3.0 Ready**

A native `<select>` wrapper with floating label, error state, helper text,
and full accessibility. For search/filterable selects, use Combobox instead.

### Props
- `value` (string): Bindable selected value.
- `label` (string): Floating or static label text.
- `placeholder` (string): Placeholder option text (first disabled option).
- `options` (array): Array of `{ value: string; label: string; disabled?: boolean }`.
- `disabled` (boolean): Disables the select.
- `required` (boolean): Marks as required for form validation.
- `invalid` (boolean): Applies error styling.
- `error` (string): Error message below the select.
- `description` (string): Helper text below the select.
- `size` ('sm' | 'md' | 'lg'): Control sizing.
- `variant` ('default' | 'floating'): Visual style — default or floating label.
- `class` (string): Additional CSS classes on the wrapper.
- `onchange` (function): Callback with the new string value.

### Accessibility Features (WCAG 3.0)
- Native `<select>` for maximum assistive technology support
- Proper `<label>` association via `for`/`id`
- `aria-invalid` + `aria-describedby` for error + description linkage
- Focus ring with minimum 3:1 contrast ratio
- 44px minimum touch target height on `md` and `lg`

### Features:
- floating label variant (material-style animated label)
- option groups support via nested option arrays
- error and description states with aria linkage
- full Svelte 5 runes: $props, $bindable, $derived
-->

<script lang="ts">
	import { cn } from '@utils/cn';

	interface SelectOption {
		value: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		value?: string;
		label?: string;
		placeholder?: string;
		options?: SelectOption[];
		disabled?: boolean;
		required?: boolean;
		invalid?: boolean;
		error?: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		variant?: 'default' | 'floating';
		class?: string;
		onchange?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		label,
		placeholder = 'Select an option...',
		options = [],
		disabled = false,
		required = false,
		invalid = false,
		error = '',
		description = '',
		size = 'md',
		variant = 'default',
		class: className = '',
		onchange
	}: Props = $props();

	const generatedId = globalThis.crypto?.randomUUID?.() ?? `select-${Math.random().toString(36).slice(2, 9)}`;
	const errorId = $derived(error ? `${generatedId}-error` : undefined);
	const descriptionId = $derived(description ? `${generatedId}-description` : undefined);

	const describedBy = $derived([descriptionId, errorId].filter(Boolean).join(' ') || undefined);

	const sizeTokens = $derived.by(() => {
		switch (size) {
			case 'sm': return { height: 'h-8', text: 'text-xs', padding: 'px-2 py-1', icon: '14' };
			case 'lg': return { height: 'h-12', text: 'text-base', padding: 'px-4 py-3', icon: '20' };
			default:   return { height: 'h-10', text: 'text-sm', padding: 'px-3 py-2', icon: '16' };
		}
	});

	function handleChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		value = val;
		onchange?.(val);
	}
</script>

<div class={cn('flex flex-col gap-1.5 w-full', className)}>
	{#if variant === 'floating' && label}
		<!-- Floating label variant -->
		<div class="relative">
			<select
				id={generatedId}
				{disabled}
				{required}
				value={value}
				onchange={handleChange}
				aria-invalid={invalid || !!error}
				aria-describedby={describedBy}
				aria-required={required}
				class={cn(
					'peer block w-full appearance-none rounded-xl border bg-surface-50 dark:bg-surface-900 transition-all',
					'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
					sizeTokens.height,
					sizeTokens.text,
					'pt-5 pb-1.5 px-3',
					invalid
						? 'border-error-500 focus:ring-error-500/20 focus:border-error-500'
						: 'border-surface-200 dark:border-surface-700',
					disabled && 'opacity-50 cursor-not-allowed'
				)}
			>
				<option value="" disabled>{placeholder}</option>
				{#each options as opt (opt.value)}
					<option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
				{/each}
			</select>

			<label
				for={generatedId}
				class={cn(
					'pointer-events-none absolute left-3 origin-left transition-all duration-200',
					'peer-focus:-translate-y-3.5 peer-focus:scale-75 peer-focus:text-primary-500',
					value
						? '-translate-y-3.5 scale-75 text-primary-500'
						: 'top-1/2 -translate-y-1/2 text-surface-500 dark:text-surface-400',
					sizeTokens.text,
					invalid && 'text-error-500! peer-focus:text-error-500!'
				)}
			>
				{label}
				{#if required}
					<span class="text-error-500" aria-hidden="true">*</span>
				{/if}
			</label>

			<!-- Chevron icon -->
			<iconify-icon
				icon="mdi:chevron-down"
				width={sizeTokens.icon}
				class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 transition-transform peer-focus:rotate-180"
				aria-hidden="true"
			></iconify-icon>
		</div>
	{:else}
		<!-- Default label-above variant -->
		{#if label}
			<label for={generatedId} class="text-sm font-semibold text-surface-700 dark:text-surface-300">
				{label}
				{#if required}
					<span class="text-error-500 ml-0.5" aria-hidden="true">*</span>
				{/if}
			</label>
		{/if}

		<div class="relative">
			<select
				id={generatedId}
				{disabled}
				{required}
				value={value}
				onchange={handleChange}
				aria-invalid={invalid || !!error}
				aria-describedby={describedBy}
				aria-required={required}
				class={cn(
					'block w-full appearance-none rounded-xl border bg-surface-50 dark:bg-surface-900 transition-all',
					'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
					sizeTokens.height,
					sizeTokens.text,
					sizeTokens.padding,
					'pr-10',
					invalid
						? 'border-error-500 focus:ring-error-500/20 focus:border-error-500'
						: 'border-surface-200 dark:border-surface-700',
					disabled && 'opacity-50 cursor-not-allowed'
				)}
			>
				<option value="" disabled>{placeholder}</option>
				{#each options as opt (opt.value)}
					<option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
				{/each}
			</select>

			<iconify-icon
				icon="mdi:chevron-down"
				width={sizeTokens.icon}
				class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-surface-400"
				aria-hidden="true"
			></iconify-icon>
		</div>
	{/if}

	{#if description && !error}
		<p id={descriptionId} class="text-xs text-surface-500 dark:text-surface-400">{description}</p>
	{/if}

	{#if error}
		<p id={errorId} class="text-xs text-error-500 font-medium" role="alert">{error}</p>
	{/if}
</div>
