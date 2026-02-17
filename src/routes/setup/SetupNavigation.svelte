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
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
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
				<SystemTooltip title={m.button_previous()}>
					<button
						onclick={() => onprev()}
						class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 flex items-center gap-1"
						aria-label={m.button_previous?.() || 'Go to previous step'}
					>
						<iconify-icon icon="mdi:arrow-left-bold" class="h-5 w-5"></iconify-icon>
						<span class="inline">{m.button_previous()}</span>
					</button>
				</SystemTooltip>
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
				<SystemTooltip title={m.button_next()}>
					<button
						onclick={() => onnext()}
						disabled={!canProceed || isLoading}
						aria-disabled={!canProceed || isLoading}
						class="preset-filled-tertiary-500 btn transition-all dark:preset-filled-primary-500 {canProceed
							? ''
							: 'cursor-not-allowed opacity-60'} flex items-center gap-1"
						aria-label={m.button_next?.() || 'Go to next step'}
					>
						{#if isLoading && currentStep === 0}
							<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white" role="status"></div>
							<span class="inline">Seeding...</span>
						{:else}
							<span class="inline">{m.button_next()}</span>
							<iconify-icon icon="mdi:arrow-right-bold" class="h-5 w-5"></iconify-icon>
						{/if}
					</button>
				</SystemTooltip>
			{:else if currentStep === totalSteps - 1}
				<SystemTooltip title={m.button_complete?.() || 'Complete'}>
					<button
						onclick={() => oncomplete()}
						disabled={isLoading}
						aria-disabled={isLoading}
						class="preset-filled-tertiary-500 btn transition-all dark:preset-filled-primary-500 {isLoading
							? 'cursor-not-allowed opacity-60'
							: ''} flex items-center gap-1"
						aria-label={m.button_complete?.() || 'Complete setup'}
					>
						{#if isLoading}
							<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white" role="status"></div>
							<span class="inline">Completing...</span>
						{:else}
							<span class="inline">{m.button_complete?.() || 'Complete'}</span>
							<iconify-icon icon="mdi:check-bold" class="h-5 w-5"></iconify-icon>
						{/if}
					</button>
				</SystemTooltip>
			{/if}
		</div>
	</div>
</div>
