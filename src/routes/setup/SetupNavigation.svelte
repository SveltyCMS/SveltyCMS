<!--
@file src/routes/setup/SetupNavigation.svelte
@component **Footer navigation component for the main content card**

Features:
- Previous button
- Next button
- Complete button
- Step indicator
- Loading state
- Error state	

-->
<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';

	import * as m from '@src/paraglide/messages';

	const {
		currentStep,
		totalSteps,
		canProceed,
		isLoading,
		isSeeding = false,
		seedingProgress = 0,
		onprev = () => {},
		onnext = () => {},
		oncomplete = () => {}
	} = $props();
</script>

<div class="flex flex-col border-t border-slate-200 dark:text-white">
	{#if isSeeding}
		<div class="bg-surface-100 h-1.5 w-full overflow-hidden dark:bg-surface-700">
			<div
				class="bg-tertiary-500 h-full transition-all duration-500 ease-out dark:bg-primary-500"
				style="width: {seedingProgress}%"
				role="progressbar"
				aria-valuenow={seedingProgress}
				aria-valuemin="0"
				aria-valuemax="100"
			></div>
		</div>
		<div class="flex items-center justify-between px-4 pt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:px-8">
			<span>Database Seeding Progress</span>
			<span>{seedingProgress}%</span>
		</div>
	{/if}

	<div class="flex shrink-0 items-center justify-between px-4 pb-4 pt-4 sm:px-8 sm:pb-6 sm:pt-6">
		<!-- Previous Button -->
		<div class="flex-1">
			{#if currentStep > 0}
				<button onclick={() => onprev()} class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">
					<CircleQuestionMark size={24} class="sm:mr-1 h-4 w-4" />
					<span class="hidden sm:inline">{m.button_previous()}</span>
				</button>
			{/if}
		</div>

		<!-- Step Indicator -->
		<div class="shrink-0 text-center text-sm font-medium">
			<span class="sm:hidden">{currentStep + 1} / {totalSteps}</span>
			<span class="hidden sm:inline">{m.setup_progress_step_of({ current: String(currentStep + 1), total: String(totalSteps) })}</span>
		</div>

		<!-- Next/Complete Button -->
		<div class="flex flex-1 justify-end">
			{#if currentStep < totalSteps - 1}
				<button
					onclick={() => onnext()}
					disabled={!canProceed || isLoading}
					aria-disabled={!canProceed || isLoading}
					class="preset-filled-tertiary-500 btn transition-all dark:preset-filled-primary-500 {canProceed ? '' : 'cursor-not-allowed opacity-60'}"
				>
					{#if isLoading && currentStep === 0}
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white" role="status"></div>
						<span class="ml-2 hidden sm:inline">Seeding...</span>
					{:else}
						<span class="hidden sm:inline">{m.button_next()}</span>
						<CircleQuestionMark size={24} class="sm:ml-1 h-4 w-4" />
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
						<span class="ml-2 hidden sm:inline">Completing...</span>
					{:else}
						<span class="hidden sm:inline">{m.button_complete?.() || 'Complete'}</span>
						<CircleQuestionMark size={24} class="sm:ml-1 h-4 w-4" />
					{/if}
				</button>
			{/if}
		</div>
	</div>
</div>
