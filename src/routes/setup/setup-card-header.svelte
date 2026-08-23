<!--
@file src/routes/setup/SetupCardHeader.svelte
@description Header component for the main content card.
Displays the current step title and icon, and a reset button.
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';

	// Using iconify-icon web component
	const { currentStep, steps, onreset = () => {} } = $props();

	const icons = $derived(['mdi:database', 'mdi:account', 'mdi:cog', 'mdi:email', 'mdi:check-circle']);
</script>

<div class="flex shrink-0 justify-between bg-white dark:bg-surface-800 border border-surface-500/30 dark:border-surface-500/40 p-2 rounded ">
	<h2 class="flex justify-center items-center text-lg font-semibold tracking-tight sm:text-xl text-surface-900 dark:text-surface-50">
		{#if icons[currentStep]}
			<iconify-icon icon={icons[currentStep]} class="me-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
		{/if}
		{steps[currentStep]?.label || 'Loading...'}
	</h2>
	<SystemTooltip title="Reset data">
		<Button variant="outline"
			onclick={() => onreset()}
			type="button"
			aria-label="Reset data"
		 size="sm" class="text-surface-900 dark:text-surface-50">
			<iconify-icon icon="mdi:backup-restore" width={24} class="me-1"></iconify-icon>
			<span class="">Reset Data</span>
		</Button>
	</SystemTooltip>
</div>
