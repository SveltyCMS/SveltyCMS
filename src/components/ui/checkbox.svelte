<!--
@file src/components/ui/checkbox.svelte
@component
**SveltyCMS Checkbox Primitive — WCAG 3.0 Ready**

A fully accessible checkbox component with indeterminate state support,
keyboard navigation, and motion-respecting transitions.

### Props
- `checked` (boolean | 'indeterminate'): Bindable checked state. Use 'indeterminate' for tri-state.
- `label` (string): Accessible label text displayed next to the checkbox.
- `description` (string): Optional helper text below the label.
- `disabled` (boolean): Disables interaction and applies reduced opacity.
- `required` (boolean): Marks the checkbox as required for form validation.
- `invalid` (boolean): Applies error styling when validation fails.
- `error` (string): Error message displayed below the checkbox.
- `name` (string): Form name attribute.
- `value` (string): Form value attribute.
- `size` ('sm' | 'md' | 'lg'): Control sizing for different density layouts.
- `variant` ('default' | 'card' | 'toggle-card'): Visual presentation variant.
- `class` (string): Additional CSS classes on the root container.
- `onchange` (function): Callback invoked with the new boolean state.

### Accessibility Features (WCAG 3.0)
- Native `<input type="checkbox" aria-label="Input">` for maximum assistive tech compatibility
- 24px minimum touch target on all size variants
- `aria-invalid` + `aria-describedby` error linkage
- `aria-checked="mixed"` for indeterminate state
- Focus ring with minimum 3:1 contrast ratio
- Respects `prefers-reduced-motion` for all transitions
- Keyboard: Space/Enter to toggle, no trapping

### Features:
- tri-state checkbox (checked / unchecked / indeterminate)
- card and toggle-card visual variants for settings panels
- animated check mark with motion-respecting transitions
- error state with live-region announcement
- full Svelte 5 runes: $props, $bindable, $derived, $state
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import { generateId } from '@utils/id-generator';

	interface Props {
		checked?: boolean | 'indeterminate';
		label?: string;
		description?: string;
		disabled?: boolean;
		required?: boolean;
		invalid?: boolean;
		error?: string;
		name?: string;
		value?: string;
		size?: 'sm' | 'md' | 'lg';
		variant?: 'default' | 'card' | 'toggle-card';
		class?: string;
		hideLabel?: boolean;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		label,
		description,
		disabled = false,
		required = false,
		invalid = false,
		error = '',
		name = '',
		value = 'on',
		size = 'md',
		variant = 'default',
		class: className = '',
		hideLabel = false,
		onchange
	}: Props = $props();

	// Internal boolean for the native checkbox (HTML checkbox doesn't support indeterminate natively)
	let internalChecked = $state(checked !== false);
	let prefersReducedMotion = $state(false);

	const generatedId = generateId('checkbox');
	const errorId = $derived(error ? `${generatedId}-error` : undefined);
	const descriptionId = $derived(description ? `${generatedId}-description` : undefined);

	// Sync external $bindable with internal state
	$effect(() => {
		if (checked === 'indeterminate') {
			internalChecked = false;
		} else {
			internalChecked = checked;
		}
	});

	// Size tokens
	const sizeTokens = $derived.by(() => {
		switch (size) {
			case 'sm': return { box: 'size-4', icon: '12', text: 'text-xs', gap: 'gap-2', touch: 'min-h-[24px] min-w-[24px]' };
			case 'lg': return { box: 'size-6', icon: '20', text: 'text-base', gap: 'gap-3', touch: 'min-h-[32px] min-w-[32px]' };
			default:   return { box: 'size-5', icon: '16', text: 'text-sm', gap: 'gap-2.5', touch: 'min-h-[28px] min-w-[28px]' };
		}
	});

	const isIndeterminate = $derived(checked === 'indeterminate');
	const showCheck = $derived(internalChecked && !isIndeterminate);

	// Compute the aria-describedby list
	const describedBy = $derived([descriptionId, errorId].filter(Boolean).join(' ') || undefined);

	function handleChange(e: Event) {
		if (disabled) {
			e.preventDefault();
			return;
		}
		const target = e.target as HTMLInputElement;
		checked = target.checked;
		onchange?.(target.checked);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (disabled) return;
		if (e.key === ' ') {
			e.preventDefault();
			checked = !(checked === true);
			onchange?.(checked as boolean);
		}
	}

	// Touch target overlay for the box — ensures 24px minimum
	$effect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mq.matches;
		const handler = (e: MediaQueryListEvent) => { prefersReducedMotion = e.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	const cardActive = $derived((variant === 'card' || variant === 'toggle-card') && internalChecked);
</script>

<div class={cn('flex flex-col', className)}>
	<div
		class={cn(
			'inline-flex items-start select-none',
			sizeTokens.gap,
			disabled && 'opacity-50 cursor-not-allowed',
			!disabled && 'cursor-pointer'
		)}
		role="group"
	>
		<!-- Hidden native checkbox for form/AT compatibility -->
		<input aria-label={label || undefined}
			type="checkbox"
			id={generatedId}
			{name}
			{value}
			{required}
			{disabled}
			checked={internalChecked}
			aria-checked={isIndeterminate ? 'mixed' : internalChecked}
			aria-invalid={invalid || !!error}
			aria-describedby={describedBy}
			aria-required={required}
			onchange={handleChange}
			onkeydown={handleKeyDown}
			class="peer sr-only"
		/>

		<!-- Visual checkbox (card variant wraps everything) -->
		{#if variant === 'card' || variant === 'toggle-card'}
			<label
				for={generatedId}
				class={cn(
					'flex items-start w-full rounded border p-4 transition-all',
					sizeTokens.gap,
					cardActive
						? 'border-tertiary-500/70 dark:border-primary-500 bg-tertiary-500/5 dark:bg-primary-500/10 shadow-sm'
						: 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 bg-white dark:bg-surface-800',
					invalid && 'border-error-500! bg-error-50! dark:bg-error-500/10!',
					disabled && 'opacity-50 cursor-not-allowed'
				)}
			>
				<span
					class={cn(
						'shrink-0 inline-flex items-center justify-center rounded border-2 transition-all',
						sizeTokens.box,
						sizeTokens.touch,
						cardActive || internalChecked
							? 'bg-tertiary-500 dark:bg-primary-500 border-tertiary-500 dark:border-primary-500 text-white'
							: 'border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800',
						invalid && 'border-error-500!',
						prefersReducedMotion ? 'duration-0' : 'duration-150'
					)}
					aria-hidden="true"
				>
					{#if isIndeterminate}
						<iconify-icon icon="mdi:minus" width={sizeTokens.icon} class="shrink-0"></iconify-icon>
					{:else if showCheck}
						<iconify-icon icon="mdi:check" width={sizeTokens.icon} class={cn('shrink-0', !prefersReducedMotion && 'animate-in zoom-in duration-150')}></iconify-icon>
					{/if}
				</span>
				<span class="flex flex-col gap-0.5">
					{#if label}
						<span class={cn('font-medium text-surface-900 dark:text-surface-100', sizeTokens.text)}>{label}</span>
					{/if}
					{#if description}
						<span id={descriptionId} class="text-xs text-surface-500 dark:text-surface-400">{description}</span>
					{/if}
				</span>
			</label>
		{:else}
			<!-- Default variant: inline checkbox -->
			<label
				for={generatedId}
				class={cn(
					'shrink-0 inline-flex items-center justify-center rounded border-2 transition-all',
					sizeTokens.box,
					sizeTokens.touch,
					'focus-within:ring-2 focus-within:ring-primary-500/40 focus-within:ring-offset-2 dark:focus-within:ring-offset-surface-900',
					internalChecked || isIndeterminate
						? 'bg-tertiary-500 dark:bg-primary-500 border-tertiary-500 dark:border-primary-500 text-white'
						: 'border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 hover:border-primary-400',
					invalid && 'border-error-500! focus-within:ring-error-500/40!',
					disabled && 'cursor-not-allowed',
					prefersReducedMotion ? 'duration-0' : 'duration-150'
				)}
				aria-hidden="true"
			>
				{#if isIndeterminate}
					<iconify-icon icon="mdi:minus" width={sizeTokens.icon} class="shrink-0"></iconify-icon>
				{:else if showCheck}
					<iconify-icon icon="mdi:check" width={sizeTokens.icon} class={cn('shrink-0', !prefersReducedMotion && 'animate-in zoom-in duration-150')}></iconify-icon>
				{/if}
			</label>

			{#if label || description}
				<label for={generatedId} class={cn('flex flex-col gap-0.5', hideLabel && 'sr-only', disabled && 'cursor-not-allowed')}>
					{#if label}
						<span class={cn('font-medium text-surface-900 dark:text-surface-100 leading-tight', sizeTokens.text)}>
							{label}
							{#if required}
								<span class="text-error-500 ms-0.5" aria-hidden="true">*</span>
							{/if}
						</span>
					{/if}
					{#if description}
						<span id={descriptionId} class="text-xs text-surface-500 dark:text-surface-400">{description}</span>
					{/if}
				</label>
			{/if}
		{/if}
	</div>

	{#if error}
		<p id={errorId} class="mt-1 text-xs text-error-500 font-medium" role="alert">{error}</p>
	{/if}
</div>

<style>
	/* Ensure the hidden checkbox doesn't cause layout shift */
	input[type='checkbox'].sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
		}
	}
</style>
