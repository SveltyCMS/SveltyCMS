<!--
@file src/routes/setup/SetupNavigation.svelte
@description Footer navigation component for the main content card.
Handles Previous, Next, and Complete buttons and their states.
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as m from '@src/paraglide/messages';

	const dispatch = createEventDispatcher<{
		prev: void;
		next: void;
		complete: void;
	}>();

	let { currentStep, totalSteps, canProceed, isLoading } = $props<{
		currentStep: number;
		totalSteps: number;
		canProceed: boolean;
		isLoading: boolean;
	}>();
</script>

<div class="flex flex-shrink-0 items-center justify-between border-t border-slate-200 px-4 pb-4 pt-4 sm:px-8 sm:pb-6 sm:pt-6">
	<!-- Previous Button -->
	<div class="flex-1">
		{#if currentStep > 0}
			<button onclick={() => dispatch('prev')} class="bg-tertiary-500 text-white btn dark:bg-primary-500 text-white">
				<iconify-icon icon="mdi:arrow-left-bold" class="mr-1 h-4 w-4" aria-hidden="true"></iconify-icon>
				{m.button_previous()}
			</button>
		{/if}
	</div>

	<!-- Step Indicator -->
	<div class="flex-shrink-0 text-center text-sm font-medium">
		{m.setup_progress_step_of({ current: String(currentStep + 1), total: String(totalSteps) })}
	</div>

	<!-- Next/Complete Button -->
	<div class="flex flex-1 justify-end">
		{#if currentStep < totalSteps - 1}
			<button
				onclick={() => dispatch('next')}
				disabled={!canProceed || isLoading}
				aria-disabled={!canProceed || isLoading}
				class="bg-tertiary-500 text-white btn transition-all dark:bg-primary-500 text-white {canProceed ? '' : 'cursor-not-allowed opacity-60'}"
			>
				{#if isLoading && currentStep === 0}
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white" role="status"></div>
					<span class="ml-2">Seeding...</span>
				{:else}
					{m.button_next()}
					<iconify-icon icon="mdi:arrow-right-bold" class="ml-1 h-4 w-4" aria-hidden="true"></iconify-icon>
				{/if}
			</button>
		{:else if currentStep === totalSteps - 1}
			<button
				onclick={() => dispatch('complete')}
				disabled={isLoading}
				aria-disabled={isLoading}
				class="bg-tertiary-500 text-white btn transition-all dark:bg-primary-500 text-white {isLoading ? 'cursor-not-allowed opacity-60' : ''}"
			>
				{#if isLoading}
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white" role="status"></div>
					<span class="ml-2">Completing...</span>
				{:else}
					{m.button_complete?.() || 'Complete'}
					<iconify-icon icon="mdi:check-bold" class="ml-1 h-4 w-4" aria-hidden="true"></iconify-icon>
				{/if}
			</button>
		{/if}
	</div>
</div>
