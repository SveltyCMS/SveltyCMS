<!--
@file src/components/system/buttons/Button.svelte
@component
**Button component** is a reusable button component that supports different sizes, presets, icons, and rounded corners, optimized for CMS use.

### Props
- `size` {string} - Size of the button: 'sm', 'md', 'lg', or 'xl' (default: 'md')
- `preset` {string} - Preset of the button: 'primary', 'secondary', 'error', 'ghost', 'text', or 'outline' (default: 'primary')
- `leadingIcon` {string} - Icon to display before the button content
- `trailingIcon` {string} - Icon to display after the button content
- `href` {string} - URL to navigate to when the button is clicked
- `type` {string} - Button type: 'button', 'submit', or 'reset' (default: 'button')
- `rounded` {boolean} - Whether the button has rounded corners (default: false)
- `disabled` {boolean} - Whether the button is disabled (default: false)
- `loading` {boolean} - Whether the button is in a loading state (default: false)
- `loadingIcon` {string} - Icon to display in place of leadingIcon during loading (default: 'mdi:loading')
- `replaceTextOnLoading` {boolean} - Whether to hide text/children during loading state (default: false)
- `labelledBy` {string} - ARIA labelledBy for accessibility
- `describedBy` {string} - ARIA describedBy for accessibility
- `[prop: string]` - Any additional DOM attributes or events (e.g., `aria-label`, `onclick`, `data-cms-id`)

### Note on aria-label
You can pass `aria-label` directly via the spread operator (...rest) rather than using a separate prop. 
Icon-only buttons automatically get an 'aria-label="Button"' fallback unless `aria-label` or `labelledBy` is provided.

### Slots
- `default` - Content to be displayed inside the button

### Usage
<Button size="md" preset="outline" leadingIcon="mdi:star" onclick={() => alert('clicked')}>
  Click Me
</Button>

<Button leadingIcon="mdi:save" aria-label="Save document" loading />

<Button preset="primary" loading replaceTextOnLoading onclick={() => logger.debug('clicked')}>
  Submit
</Button>
-->

<script lang="ts">
	// — Types —
	type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';
	type ButtonPreset = 'primary' | 'secondary' | 'error' | 'ghost' | 'text' | 'outline';

	// — Props —
	const {
		size = 'md' as ButtonSize,
		preset = 'primary' as ButtonPreset,
		leadingIcon,
		trailingIcon,
		href,
		type = 'button' as 'button' | 'submit' | 'reset',
		rounded = false,
		disabled = false,
		loading = false,
		loadingIcon = 'mdi:loading',
		replaceTextOnLoading = false,
		labelledBy,
		describedBy,
		children,
		...rest
	}: {
		size?: ButtonSize;
		preset?: ButtonPreset;
		leadingIcon?: string;
		trailingIcon?: string;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		rounded?: boolean;
		disabled?: boolean;
		loading?: boolean;
		loadingIcon?: string;
		replaceTextOnLoading?: boolean;
		labelledBy?: string;
		describedBy?: string;
		children?: () => any;
		[prop: string]: unknown;
	} = $props();

	// — Class maps —
	const sizeClasses: Record<ButtonSize, string> = {
		sm: 'h-8 px-3 text-sm',
		md: 'h-10 px-4 text-base',
		lg: 'h-12 px-5 text-lg',
		xl: 'h-14 px-6 text-xl'
	};

	const presetClasses: Record<ButtonPreset, string> = {
		primary: 'bg-[var(--primary-color, #2563eb)] text-white shadow-sm hover:bg-[var(--primary-hover, #1e40af)]',
		secondary: 'bg-[var(--secondary-color, #4b5563)] text-white shadow-sm hover:bg-[var(--secondary-hover, #374151)]',
		error: 'bg-[var(--error-color, #dc2626)] text-white shadow-sm hover:bg-[var(--error-hover, #b91c1c)]',
		ghost: 'hover:bg-gray-100 text-gray-900',
		text: 'text-gray-900 hover:text-gray-700',
		outline: 'border border-gray-300 bg-transparent text-gray-900 hover:bg-gray-100'
	};

	const iconSizes: Record<ButtonSize, string> = {
		sm: 'h-4 w-4',
		md: 'h-5 w-5',
		lg: 'h-6 w-6',
		xl: 'h-7 w-7'
	};

	const iconOnlyPadding: Record<ButtonSize, string> = {
		sm: 'px-2',
		md: 'px-2.5',
		lg: 'px-3',
		xl: 'px-3.5'
	};

	// — Element decision —
	const element = $derived(href ? 'a' : 'button');

	// — Derived classes —
	const buttonClasses = $derived(
		[
			'inline-flex items-center justify-center font-medium transition-colors',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color, #2563eb)] focus-visible:ring-offset-2',
			'transform transition-transform hover:scale-105 active:scale-95',
			rounded ? 'rounded-full' : 'rounded-md',
			sizeClasses[size],
			presetClasses[preset],
			(disabled || loading) && 'opacity-50 pointer-events-none cursor-not-allowed',
			loading && 'animate-pulse',
			!children && (leadingIcon || trailingIcon || loading) ? iconOnlyPadding[size] : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	const iconClass = $derived(iconSizes[size]);

	// — Loading/icon logic —
	const effectiveLeadingIcon = $derived(loading ? loadingIcon : leadingIcon);
	const isIconOnly = $derived(!children && (leadingIcon || trailingIcon || loading));

	// — Element-specific a11y props —
	const ariaLabelFromRest = rest['aria-label'];
	const safeAriaLabel = typeof ariaLabelFromRest === 'string' ? ariaLabelFromRest : undefined;

	const elementProps = $derived(
		element === 'a'
			? {
					href: disabled || loading ? undefined : href,
					role: 'button',
					'aria-disabled': disabled || loading,
					tabindex: disabled || loading ? -1 : undefined,
					'aria-label': safeAriaLabel || (isIconOnly && !labelledBy ? 'Button' : undefined),
					'aria-labelledby': labelledBy || undefined,
					'aria-describedby': describedBy || undefined
				}
			: {
					type,
					disabled: disabled || loading,
					'aria-disabled': disabled || loading,
					'aria-label': safeAriaLabel || (isIconOnly && !labelledBy ? 'Button' : undefined),
					'aria-labelledby': labelledBy || undefined,
					'aria-describedby': describedBy || undefined
				}
	);
</script>

<svelte:element this={element} {...rest} {...elementProps} class={buttonClasses}>
	{#if effectiveLeadingIcon}
		<iconify-icon
			class={`${iconClass} ${children && !replaceTextOnLoading ? 'mr-2' : ''} ${loading ? 'animate-spin' : ''}`}
			icon={effectiveLeadingIcon}
		></iconify-icon>
	{/if}
	{#if !loading || !replaceTextOnLoading}
		{@render children?.()}
	{/if}
	{#if trailingIcon && !loading}
		<iconify-icon class={`${iconClass} ${children ? 'ml-2' : ''}`} icon={trailingIcon}></iconify-icon>
	{/if}
</svelte:element>
