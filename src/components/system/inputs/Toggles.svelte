<!-- 
@file src/components/system/inputs/Toggles.svelte
@description Toggle switch component with customizable icons and labels
-->

<script lang="ts">
	type Props = {
		value?: boolean;
		label?: string;
		labelColor?: string;
		iconOn?: string;
		iconOff?: string;
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		title?: string;
		onChange?: (changed: boolean) => void;
	};

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
	} = $props<Props>();

	// Generate a unique ID for a11y
	const id = `toggle-${Math.random().toString(36).substring(2, 9)}`;

	// Handle toggle state change
	function handleToggle(event: Event) {
		console.log('[Toggles] handleToggle called, disabled:', disabled, 'event type:', event.type);

		if (disabled) {
			console.log('[Toggles] Toggle is disabled, returning early');
			event.preventDefault();
			return;
		}

		const checked = (event.target as HTMLInputElement).checked;
		console.log('[Toggles] Current value:', value, 'new checked:', checked);

		value = checked;
		console.log('[Toggles] Updated value to:', value, 'calling onChange with:', checked);

		try {
			onChange?.(checked);
			console.log('[Toggles] onChange callback completed');
		} catch (error) {
			console.error('[Toggles] Error in onChange callback:', error);
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
