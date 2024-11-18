<!-- 
@file src/components/system/inputs/Toggles.svelte
@description Toggle switch component with customizable icons and labels

Features:
- Customizable label and colors
- Optional icons for on/off states
- Accessible checkbox input
- Animated state transitions
-->

<script lang="ts">
	let {
		value = $bindable(false),
		label = '',
		labelColor = 'text-primary-500',
		iconOn = '',
		iconOff = '',
		onChange
	} = $props<{
		value?: boolean;
		label?: string;
		labelColor?: string; // Default label color
		iconOn?: string; // Default icon when toggle is on
		iconOff?: string; // Default icon when toggle is off
		onChange?: (checked: boolean) => void;
	}>();

	const random = crypto.randomUUID();

	// Function to handle toggle update
	function handleToggle(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		value = checked;
		onChange?.(checked);
	}
</script>

<label for="toggleSwitch{random}" class="text-dark flex cursor-pointer select-none items-center text-white">
	<span class="mr-3 flex items-center gap-2 capitalize {value ? 'text-primary-500' : labelColor}">
		{label}
	</span>

	<div class="relative">
		<input name={label} type="checkbox" id="toggleSwitch{random}" checked={value} class="peer sr-only" onclick={handleToggle} />

		<!-- Background -->
		<div class="block h-8 w-14 rounded-full bg-surface-400 peer-checked:bg-primary-500">
			<span
				class={`absolute inset-0 flex items-center justify-end rounded-full border-2 pr-[25px] text-right text-white ${value ? 'text-right' : 'text-left'}`}
			>
				<!-- {value ? (icon ? '' : 'ON') : icon ? '' : 'OFF'} -->
			</span>
		</div>

		<!-- Icon with background color -->
		<div
			class="absolute left-1 top-1 flex h-6 w-6 items-center justify-end rounded-full bg-error-500 transition peer-checked:translate-x-6 peer-checked:bg-primary-900"
		>
			{#if value}
				<iconify-icon icon={iconOn} width="24"></iconify-icon>
			{:else}
				<iconify-icon icon={iconOff} width="24"></iconify-icon>
			{/if}
		</div>
	</div>
</label>
