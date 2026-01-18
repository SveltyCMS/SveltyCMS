<!--
@file apps/cms/src/routes/config/collectionbuilder/[action]/[...contentPath]/widget/WidgetStepper.svelte
@component Widget configuration stepper navigation similar to SetupStepper
-->
<script lang="ts">
	interface Step {
		label: string;
		shortDesc: string;
		icon: string;
	}

	interface Props {
		steps: Step[];
		currentStep: number;
		stepCompleted: boolean[];
		stepClickable: boolean[];
		onselectStep?: (stepIndex: number) => void;
	}

	const { steps, currentStep, stepCompleted, stepClickable, onselectStep = () => {} }: Props = $props();

	function handleStepClick(stepIndex: number) {
		if (stepClickable[stepIndex] || stepIndex === currentStep) {
			onselectStep(stepIndex);
		}
	}
</script>

<div class="w-full">
	<div class="flex flex-col rounded-xl border border-surface-200 bg-white shadow-xl dark:border-surface-600 dark:bg-surface-800">
		<!-- Mobile: Horizontal step indicator -->
		<div class="relative flex items-start justify-between p-4 lg:hidden" role="list" aria-label="Widget configuration progress">
			{#each steps as step, i (i)}
				<div class="relative z-10 flex flex-1 flex-col items-center" role="listitem">
					<button
						type="button"
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-10 sm:w-10 sm:text-sm {stepCompleted[
							i
						]
							? 'bg-tertiary-500 dark:bg-primary-500 text-white'
							: i === currentStep
								? 'bg-error-500 text-white shadow-xl'
								: 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-300'} {stepClickable[i] || i === currentStep
							? 'cursor-pointer'
							: 'cursor-not-allowed'}"
						aria-current={i === currentStep ? 'step' : undefined}
						aria-label={`${step.label} – ${stepCompleted[i] ? 'Completed' : i === currentStep ? 'Current step' : 'Pending step'}`}
						disabled={!(stepClickable[i] || i === currentStep)}
						onclick={() => handleStepClick(i)}
					>
						<iconify-icon icon={step.icon} width="18"></iconify-icon>
					</button>
					<div class="mt-2 text-center">
						<div
							class="text-xs font-medium sm:text-sm {i <= currentStep
								? 'text-surface-900 dark:text-white'
								: 'text-surface-500 dark:text-surface-400'}"
						>
							{step.label}
						</div>
					</div>
				</div>
			{/each}

			<!-- Connecting lines for mobile -->
			<div class="absolute left-12 right-12 top-8 flex h-0.5 sm:left-14 sm:right-14 sm:top-9" aria-hidden="true">
				{#each Array.from({ length: steps.length }, (_, i) => i) as i (i)}
					{#if i !== steps.length - 1}
						<div
							class="mx-1 h-0.5 flex-1 {stepCompleted[i]
								? 'bg-tertiary-500 dark:bg-primary-500'
								: 'border-t-2 border-dashed border-surface-300 bg-transparent'}"
						></div>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Desktop: Vertical step indicator -->
		<div class="hidden p-6 lg:block">
			{#each steps as step, i (i)}
				<div class="relative last:pb-0">
					<button
						class="flex w-full items-start gap-4 rounded-lg p-4 transition-all {stepClickable[i] || i === currentStep
							? 'hover:bg-surface-100 dark:hover:bg-surface-700'
							: 'cursor-not-allowed opacity-50'}"
						disabled={!(stepClickable[i] || i === currentStep)}
						onclick={() => handleStepClick(i)}
					>
						<div
							class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-white dark:ring-surface-800 transition-all {stepCompleted[
								i
							]
								? 'bg-tertiary-500 dark:bg-primary-500 text-white'
								: i === currentStep
									? 'bg-error-500 text-white shadow-xl'
									: 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300'}"
						>
							<iconify-icon icon={step.icon} width="20"></iconify-icon>
						</div>
						<div class="text-left">
							<div
								class="text-base font-medium {i < currentStep
									? 'text-surface-700 dark:text-surface-200'
									: i === currentStep
										? 'text-surface-900 dark:text-white'
										: 'text-surface-400 dark:text-surface-500'}"
							>
								{step.label}
							</div>
							<div
								class="mt-1 text-sm {i < currentStep
									? 'text-surface-500 dark:text-surface-400'
									: i === currentStep
										? 'text-surface-600 dark:text-surface-300'
										: 'text-surface-400 dark:text-surface-500'}"
							>
								{step.shortDesc}
							</div>
						</div>
					</button>
					{#if i !== steps.length - 1}
						<div
							class="absolute left-[1.9rem] top-16 h-[calc(100%-4rem)] w-[2px] {stepCompleted[i]
								? 'bg-tertiary-500 dark:bg-primary-500'
								: 'border-l-2 border-dashed border-surface-300'}"
						></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
