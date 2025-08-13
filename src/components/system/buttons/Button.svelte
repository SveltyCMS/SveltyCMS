<!--
file src/components/system/buttons/Button.svelte
@component
**Button component** is a reusable button component that supports different sizes, variants, icons, and rounded corners.

#### Props
- `size` {string} - Size of the button, can be 'sm', 'md', 'lg', or 'xl'
- `variant` {string} - Variant of the button, can be 'primary', 'secondary', 'ghost', or 'text'
- `icon` {string} - Icon to be displayed on the button
- `href` {string} - URL to navigate to when the button is clicked
- `type` {string} - Type of the button, can be 'button', 'submit', or 'reset'
- `rounded` {boolean} - Whether the button should have rounded corners

#### Slots
- `default` {string} - Content to be displayed inside the button

#### Usage
```tsx
<Button size="md" variant="primary">Click Me</Button>
```
-->

<script lang="ts">
	//Props
	const {
		size = 'md', // Default size
		variant = 'primary', // Default variant
		icon, // Optional icon
		href, // Optional href for link buttons
		type = 'button', // Default button type
		rounded = false, // Rounded corners
		disabled = false, // Disabled state
		labelledBy, //ARIA labelledBy
		describedBy, //ARIA describedBy
		children, // Snippet for default slot content
		...rest // Capture all other props
	} = $props<{
		size?: 'sm' | 'md' | 'lg' | 'xl'; // Button size options
		variant?: 'primary' | 'secondary' | 'error' | 'ghost' | 'text'; // Button variants - added 'error'
		icon?: string; // Icon name (e.g., from Iconify)
		href?: string; // URL for link buttons
		type?: 'button' | 'submit' | 'reset'; // Button type
		rounded?: boolean; // Whether to use rounded corners
		disabled?: boolean; // Disabled state
		labelledBy?: string; //ARIA labelledBy
		describedBy?: string; //ARIA describedBy
		children?: () => any; // Snippet for default slot content
	}>();

	// Dynamically compute button classes
	const buttonClasses = $derived(
		[
			// Base styles
			'inline-flex items-center justify-center font-medium transition-colors',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
			'transform transition-transform hover:scale-105 active:scale-95',
			rounded ? 'rounded-full' : 'rounded-md', // Rounded corners conditionally
			// Size classes
			{
				sm: 'h-8 px-3 text-sm',
				md: 'h-10 px-4 text-base',
				lg: 'h-12 px-5 text-lg',
				xl: 'h-14 px-6 text-xl'
			}[size as keyof { sm: string; md: string; lg: string; xl: string }],
			// Variant classes
			{
				primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700',
				secondary: 'bg-secondary-600 text-white shadow-sm hover:bg-secondary-700',
				error: 'bg-red-600 text-white shadow-sm hover:bg-red-700', // Added error variant
				ghost: 'hover:bg-gray-100 text-gray-900',
				text: 'text-gray-900 hover:text-gray-700'
			}[
				variant as keyof {
					primary: string;
					secondary: string;
					error: string;
					ghost: string;
					text: string;
				}
			], // Added error variant to keyof
			// Disabled state
			disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
			// Icon-only padding adjustment
			!children && icon
				? {
						sm: 'px-2',
						md: 'px-2.5',
						lg: 'px-3',
						xl: 'px-3.5'
					}[size as keyof { sm: string; md: string; lg: string; xl: string }]
				: ''
		]
			.filter(Boolean)
			.join(' ') // Filter out falsy values and join into a single string
	);

	// Icon sizing based on button size - using type-safe key
	const iconSize = {
		sm: 'h-4 w-4',
		md: 'h-5 w-5',
		lg: 'h-6 w-6',
		xl: 'h-7 w-7'
	} as const;
	const iconClass = $derived(iconSize[size as keyof typeof iconSize]);

	// Determine the element type (button or anchor)
	const element = href ? 'a' : 'button';

	// Element-specific props for accessibility
	const elementProps = $derived(
		element === 'a'
			? {
					href: disabled ? undefined : href, // Disable href if button is disabled
					role: 'button', // Ensure anchor behaves like a button
					'aria-disabled': disabled, // Accessibility for disabled state
					tabindex: disabled ? -1 : undefined, // Prevent focus if disabled
					'aria-labelledby': labelledBy || undefined,
					'aria-describedby': describedBy || undefined
				}
			: {
					type, // Button type (button, submit, reset)
					disabled, // Native disabled attribute
					'aria-disabled': disabled, // Accessibility for disabled state
					'aria-labelledby': labelledBy || undefined,
					'aria-describedby': describedBy || undefined
				}
	);
</script>

<!-- Dynamically render the button -->
<svelte:element this={element} {...rest} {...elementProps} class={buttonClasses}>
	<!-- Icon (optional) -->
	{#if icon}
		<iconify-icon class={`${iconClass} ${children ? 'mr-2' : ''}`} {icon}></iconify-icon>
	{/if}

	{@render children?.()}
</svelte:element>
