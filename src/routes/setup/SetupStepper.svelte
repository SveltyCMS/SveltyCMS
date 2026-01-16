<!--
@file src/routes/setup/SetupStepper.svelte
@description Stepper component for the setup wizard.
Shows horizontal stepper on mobile, vertical stepper on desktop with legend.
-->
<script lang="ts">
	import VersionCheck from '@components/VersionCheck.svelte';

	const { steps, currentStep, stepCompleted, stepClickable, legendItems, onselectStep = () => {} } = $props();

	function handleStepClick(stepIndex: number) {
		if (stepClickable[stepIndex] || stepIndex === currentStep) {
			onselectStep(stepIndex);
		}
	}

	// Hover handler for prefetching - parent can handle this if needed

	function handleStepHover(_stepIndex: number) {
		// Intentionally empty - reserved for future hover prefetch optimization
	}
</script>

<div class="w-full shrink-0 lg:w-80 xl:w-96">
	<div class="flex flex-col rounded-xl border border-surface-200 bg-white shadow-xl dark:border-white dark:bg-surface-800">
		<!-- Mobile: Horizontal step indicator -->
		<div class="relative flex items-start justify-between p-4 lg:hidden" role="list" aria-label="Setup progress">
			{#each steps as step, i (i)}
				<!-- Mobile step (button for backward navigation) -->
				<div class="relative z-10 flex flex-1 flex-col items-center" role="listitem">
					<button
						type="button"
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-10 sm:w-10 sm:text-sm {stepCompleted[
							i
						]
							? 'bg-primary-500 text-white'
							: i === currentStep
								? 'bg-error-500 text-white shadow-xl'
								: 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400'} {stepClickable[i] || i === currentStep
							? 'cursor-pointer'
							: 'cursor-not-allowed'}"
						aria-current={i === currentStep ? 'step' : undefined}
						aria-label={`${step.label} – ${stepCompleted[i] ? 'Completed' : i === currentStep ? 'Current step' : 'Pending step'}`}
						disabled={!(stepClickable[i] || i === currentStep)}
						onmouseenter={() => handleStepHover(i)}
						onfocus={() => handleStepHover(i)}
						onclick={() => handleStepClick(i)}
					>
						<span class="text-[0.65rem]">
							{stepCompleted[i] ? '✓' : i === currentStep ? '●' : '•'}
						</span>
					</button>
					<div class="mt-2 text-center">
						<div
							class="text-xs font-medium sm:text-sm {i <= currentStep
								? 'text-surface-900 dark:text-white'
								: 'text-surface-500 dark:text-surface-400'} max-w-16 truncate sm:max-w-20"
						>
							{step.label.split(' ')[0]}
						</div>
					</div>
				</div>
			{/each}

			<!-- Connecting lines for mobile -->
			<div class="absolute left-12 right-12 top-8 flex h-0.5 sm:left-14 sm:right-14 sm:top-9" aria-hidden="true">
				{#each Array.from({ length: steps.length }, (_, i) => i) as i (i)}{#if i !== steps.length - 1}<div
							class="mx-1 h-0.5 flex-1 {stepCompleted[i] ? 'bg-primary-500' : 'border-t-2 border-dashed border-slate-200 bg-transparent'}"
						></div>{/if}{/each}
			</div>
		</div>

		<!-- Desktop: Vertical step indicator -->
		<div class="hidden p-6 lg:block">
			{#each steps as step, i (i)}
				<div class="relative last:pb-0">
					<button
						class="flex w-full items-start gap-4 rounded-lg p-4 transition-all {stepClickable[i] || i === currentStep
							? 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
							: 'cursor-not-allowed opacity-50'}"
						disabled={!(stepClickable[i] || i === currentStep)}
						onmouseenter={() => handleStepHover(i)}
						onfocus={() => handleStepHover(i)}
						onclick={() => handleStepClick(i)}
					>
						<div
							class="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-white transition-all {stepCompleted[
								i
							]
								? 'bg-primary-500 text-white'
								: i === currentStep
									? 'bg-error-500 text-white shadow-xl'
									: 'bg-slate-200 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600'}"
						>
							<span class="text-[0.65rem]">
								{stepCompleted[i] ? '✓' : i === currentStep ? '●' : '•'}
							</span>
						</div>
						<div class="text-left">
							<div
								class="text-base font-medium {i < currentStep
									? 'text-slate-800 dark:text-slate-200'
									: i === currentStep
										? 'text-slate-900 dark:text-white'
										: 'text-slate-400 dark:text-slate-600'}"
							>
								{step.label}
							</div>
							<div
								class="mt-1 text-sm {i < currentStep
									? 'text-slate-500 dark:text-slate-400'
									: i === currentStep
										? 'text-slate-600 dark:text-slate-300'
										: 'text-slate-400 dark:text-slate-600'}"
							>
								{step.shortDesc}
							</div>
						</div>
					</button>
					{#if i !== steps.length - 1}<div
							class="absolute left-[1.65rem] top-[3.5rem] h-[calc(100%-3.5rem)] w-[2px] {stepCompleted[i]
								? 'bg-primary-500'
								: 'border-l-2 border-dashed border-slate-200'}"
						></div>{/if}
				</div>
			{/each}
			<!-- Setup Steps Legend -->
			<!-- Setup Steps Legend -->
			<div class="mt-6 border-t pt-6">
				<div class="mb-4">
					<h4 class="mb-4 text-sm font-semibold tracking-tight text-slate-700 dark:text-slate-200">Legend</h4>
					<ul class="space-y-2 text-xs">
						{#each legendItems as item (item.key)}
							<li class="grid grid-cols-[1.4rem_auto] items-center gap-x-3">
								<div
									class="flex h-5 w-5 items-center justify-center rounded-full font-semibold leading-none
									{item.key === 'completed' ? ' bg-primary-500 text-white' : ''}
									{item.key === 'current' ? ' bg-error-500 text-white shadow-sm' : ''}
									{item.key === 'pending' ? ' bg-slate-200 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600' : ''}"
								>
									<span class="text-[0.65rem]">{item.content}</span>
								</div>
								<span class="text-slate-600 dark:text-slate-400">{item.label}</span>
							</li>
						{/each}
					</ul>
				</div>

				<!-- Version Check  -->
				<div class="flex items-center text-left">
					<VersionCheck />
				</div>
			</div>
		</div>
	</div>
</div>
