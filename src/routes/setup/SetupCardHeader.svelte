<!--
@file src/routes/setup/SetupCardHeader.svelte
@description Header component for the main content card.
Displays the current step title and icon, and a reset button.
-->
<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';

	// Using iconify-icon web component
	const { currentStep, steps, onreset = () => {} } = $props();

	const icons = $derived(['mdi:database', 'mdi:account', 'mdi:cog', 'mdi:email', 'mdi:check-circle']);
</script>

<div class="flex shrink-0 justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
	<h2 class="flex justify-center items-center text-lg font-semibold tracking-tight sm:text-xl text-black dark:text-white">
		{#if icons[currentStep]}
			{#if icons[currentStep as keyof typeof iconsData] as any}<Icon
					icon={icons[currentStep as keyof typeof iconsData] as any}
					class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5"
					aria-hidden="true"
				/>{/if}
		{/if}
		{steps[currentStep]?.label || 'Loading...'}
	</h2>
	<button
		onclick={() => onreset()}
		type="button"
		class="dark:text-secondary-50 preset-outlined-surface-500 btn-sm rounded"
		aria-label="Reset data"
		title="Reset data"
	>
		<CircleQuestionMark size={24} class="mr-1" />
		<span class="sm:inline">Reset Data</span>
	</button>
</div>
