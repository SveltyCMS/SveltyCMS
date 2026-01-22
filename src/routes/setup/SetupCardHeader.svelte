<!--
@file src/routes/setup/SetupCardHeader.svelte
@description Header component for the main content card.
Displays the current step title and icon, and a reset button.
-->
<script lang="ts">
	// Lucied Icons
	import Database from '@lucide/svelte/icons/database';
	import User from '@lucide/svelte/icons/user';
	import Settings from '@lucide/svelte/icons/settings';
	import Mail from '@lucide/svelte/icons/mail';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	// Using iconify-icon web component
	const { currentStep, steps, onreset = () => {} } = $props();

	const icons = $derived([Database, User, Settings, Mail, CheckCircle]);
</script>

<div class="flex shrink-0 justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
	<h2 class="flex justify-center items-center text-lg font-semibold tracking-tight sm:text-xl text-black dark:text-white">
		{#if icons[currentStep]}
			{@const Icon = icons[currentStep]}
			<Icon class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true" />
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
		<RotateCcw size={16} class="mr-2" />
		<span class="sm:inline">Reset Data</span>
	</button>
</div>
