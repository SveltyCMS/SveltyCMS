<!--
@file src/routes/setup/SetupCardHeader.svelte
@description Header component for the main content card.
Displays the current step title and icon, and a reset button.
-->
<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';

	// Using iconify-icon web component
	const { currentStep, steps, onreset = () => {} } = $props();

	const icons = $derived(['mdi:database', 'mdi:account', 'mdi:cog', 'mdi:email', 'mdi:check-circle']);
</script>

<div class="flex shrink-0 justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
	<h2 class="flex justify-center items-center text-lg font-semibold tracking-tight sm:text-xl text-black dark:text-white">
		{#if icons[currentStep]}
			<iconify-icon icon={icons[currentStep]} class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
		{/if}
		{steps[currentStep]?.label || 'Loading...'}
	</h2>
	<SystemTooltip title="Reset data">
		<button
			onclick={() => onreset()}
			type="button"
			class="flex items-center dark:text-secondary-50 preset-outlined btn-sm rounded"
			aria-label="Reset data"
		>
			<iconify-icon icon="mdi:backup-restore" width={24} class="mr-1"></iconify-icon>
			<span class="">Reset Data</span>
		</button>
	</SystemTooltip>
</div>
