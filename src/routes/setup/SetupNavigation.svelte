<!--
@file src/routes/setup/SetupNavigation.svelte
@description Footer navigation component for the main content card.
Handles Previous, Next, and Complete buttons and their states.
-->
<script lang="ts">
	import * as m from '@src/paraglide/messages';

	const { currentStep, totalSteps, canProceed, isLoading, onprev = () => {}, onnext = () => {}, oncomplete = () => {} } = $props();
</script>

<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-slate-200 px-4 py-3 sm:px-6">
	<!-- Previous Button -->
	<div class="justify-self-start">
		{#if currentStep > 0}
			<button onclick={() => onprev()} class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">
				<iconify-icon icon="mdi:arrow-left-bold" class="mr-1 h-4 w-4" aria-hidden="true"></iconify-icon>
				{m.button_previous()}
			</button>
		{/if}
	</div>

	<!-- Step Indicator -->
	<div class="text-center text-sm font-medium whitespace-nowrap">
		{m.setup_progress_step_of({ current: String(currentStep + 1), total: String(totalSteps) })}
	</div>

	<!-- Next/Complete Button -->
	<div class="flex justify-end justify-self-end">
		{#if currentStep < totalSteps - 1}
			<button
				onclick={() => onnext()}
				disabled={!canProceed || isLoading}
				aria-disabled={!canProceed || isLoading}
				class="preset-filled-tertiary-500 btn transition-all dark:preset-filled-primary-500 {canProceed ? '' : 'cursor-not-allowed opacity-60'}"
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
				onclick={() => oncomplete()}
				disabled={isLoading}
				aria-disabled={isLoading}
				class="preset-filled-tertiary-500 btn transition-all dark:preset-filled-primary-500 {isLoading ? 'cursor-not-allowed opacity-60' : ''}"
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
