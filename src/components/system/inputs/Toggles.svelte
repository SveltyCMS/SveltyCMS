<!-- 
@file src/components/system/inputs/Toggles.svelte
@component
**Toggle switch component with customizable icons and labels**

### Props
- `value` {boolean}: The toggle state (bindable)
- `label` {string}: Label displayed next to the toggle (default: '')
- `labelColor` {string}: Color class for the label when off (default: 'text-primary-500')
- `iconOn` {string}: Icon to display when toggle is on (default: '')
- `iconOff` {string}: Icon to display when toggle is off (default: '')
- `size` {'sm' | 'md' | 'lg'}: Size of the toggle (default: 'md')
- `disabled` {boolean}: Whether the toggle is disabled (default: false)
- `title` {string}: Title attribute for the toggle (default: '')
- `onChange` {(changed: boolean) => void}: Callback function when toggle state changes (optional)	

### Features:
- Customizable icons for on/off states
- Size options for different UI needs
- Disabled state handling
- Accessible with proper labeling and focus management
-->

<script lang="ts">
	import { logger } from '@utils/logger';

	let {
		value = $bindable(false),
		label = '',
		labelColor = 'text-primary-500',
		iconOn = '',
		iconOff = '',
		size = 'md',
		disabled = false,
		title = '',
		onChange
	} = $props();

	// Generate a unique ID for a11y
	const id = `toggle-${Math.random().toString(36).substring(2, 9)}`;

	// Handle toggle state change
	function handleToggle(event: Event) {
		if (disabled) {
			event.preventDefault();
			return;
		}

		const checked = (event.target as HTMLInputElement).checked;

		value = checked;

		try {
			onChange?.(checked);
		} catch (error) {
			logger.error('[Toggles] Error in onChange callback:', error);
		}
	}

	// Compute classes and sizes using $derived
	const trackClasses = $derived(
		{
			sm: 'h-6 w-10 min-w-[40px]', // Ensure minimum touch target size
			md: 'h-8 w-14 min-w-[48px]',
			lg: 'h-10 w-20 min-w-[56px]'
		}[size]
	);

	const dotClasses = $derived(
		{
			sm: 'h-4 w-4 peer-checked:translate-x-5',
			md: 'h-6 w-6 peer-checked:translate-x-7',
			lg: 'h-8 w-8 peer-checked:translate-x-11'
		}[size]
	);

	const iconSize = $derived(
		{
			sm: '16',
			md: '24',
			lg: '32'
		}[size]
	);
</script>

<label for={id} class="flex cursor-pointer select-none items-center gap-2" class:opacity-50={disabled} class:cursor-not-allowed={disabled} {title}>
	{#if label}
		<span class="capitalize {value ? 'text-primary-500' : labelColor}">{label}</span>
	{/if}

	<div class="relative">
		<input name={label || 'toggle'} type="checkbox" {id} bind:checked={value} {disabled} class="peer sr-only" onchange={handleToggle} />

		<!-- Background track -->
		<div class="{trackClasses} rounded-full bg-error-500 transition-colors peer-checked:bg-primary-500">
			<!-- Sliding dot -->
			<div
				class="{dotClasses} absolute left-1 top-1 flex items-center justify-center rounded-full bg-white transition-transform"
				class:bg-surface-400={disabled}
			>
				{#if iconOn && iconOff}
					<iconify-icon
						icon={value ? iconOn : iconOff}
						width={iconSize}
						class={value ? 'text-primary-500' : 'text-error-500'}
						class:text-surface-600={disabled}
					></iconify-icon>
				{:else}
					<span class="text-[10px] font-bold {value ? 'text-primary-500' : 'text-error-500'}" class:text-surface-600={disabled}>
						{value ? 'ON' : 'OFF'}
					</span>
				{/if}
			</div>
		</div>
	</div>
</label>

<style>
	/* Ensure minimum touch target size */
	input[type='checkbox'] {
		touch-action: manipulation; /* Improve touch responsiveness */
	}
</style>
