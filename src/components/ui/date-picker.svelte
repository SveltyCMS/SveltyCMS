<!-- 
 @src/routes/api/cms.ts src/components/ui/date-picker.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 DatePicker Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Props {
	value?: string;
	label?: string;
	min?: string;
	max?: string;
	disabled?: boolean;
	class?: string;
	onchange?: (value: string) => void;
}

let {
	value = $bindable(''),
	label,
	min,
	max,
	disabled = false,
	class: className = '',
	onchange
}: Props = $props();

const classes = $derived(cn(
	'input px-3 py-2 rounded-lg border transition-all duration-200',
	'bg-surface-50 dark:bg-surface-900 border-surface-200 dark:border-surface-700',
	'focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
	disabled && 'opacity-50 cursor-not-allowed grayscale',
	className
));

const id = Math.random().toString(36).substring(7);
</script>

<div class="space-y-1 w-full">
	{#if label}
		<label class="block text-sm font-bold opacity-80 pl-1" for={id}>
			{label}
		</label>
	{/if}
	
	<div class="relative group">
		<input
			{id}
			type="date"
			bind:value
			{min}
			{max}
			{disabled}
			class={classes}
			onchange={(e) => onchange?.(e.currentTarget.value)}
		/>
		
		<!-- Decorative Calendar Icon (Internal to input area if possible, or overlay) -->
		<div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-focus-within:opacity-100 transition-opacity">
			<iconify-icon icon="mdi:calendar" width="20"></iconify-icon>
		</div>
	</div>
</div>

<style>
/* Custom styling to hide the default browser calendar icon if desired, or just style around it */
::-webkit-calendar-picker-indicator {
    background: transparent;
    bottom: 0;
    color: transparent;
    cursor: pointer;
    height: auto;
    left: 0;
    position: absolute;
    right: 30px;
    top: 0;
    width: auto;
}
</style>
