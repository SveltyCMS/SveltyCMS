<!--
@file src/routes/setup/SetupCardHeader.svelte
@description Header component for the main content card.
Displays the current step title and icon, and a reset button.
-->
<script lang="ts">
	const { currentStep, steps, onreset = () => {} } = $props();

	const icons = $derived(['mdi:database', 'mdi:account', 'mdi:cog', 'mdi:email', 'mdi:check-circle']);
</script>

<div class="flex shrink-0 justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
	<h2 class="flex items-center text-lg font-semibold tracking-tight sm:text-xl">
		{#if icons[currentStep]}
			<iconify-icon icon={icons[currentStep]} class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
		{/if}
		{steps[currentStep]?.label || 'Loading...'}
	</h2>
	<button
		onclick={() => onreset()}
		type="button"
		class="btn-sm preset-ghost flex items-center gap-1 rounded text-xs"
		aria-label="Reset data"
		title="Reset data"
	>
		<iconify-icon icon="mdi:backup-restore" class="mr-1 h-4 w-4" aria-hidden="true"></iconify-icon>
		<span class="hidden sm:inline">Reset Data</span>
	</button>
</div>
