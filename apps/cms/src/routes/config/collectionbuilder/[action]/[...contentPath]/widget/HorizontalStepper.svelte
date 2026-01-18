<!--
@file apps/cms/src/routes/config/collectionbuilder/[action]/[...contentPath]/widget/HorizontalStepper.svelte
@component Horizontal stepper for widget configuration on top of page
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

<div class="w-full mb-6">
	<!-- Horizontal step indicator -->
	<div class="rounded-xl border border-surface-200/50 bg-white/80 p-4 shadow-lg backdrop-blur-sm dark:border-surface-600/50 dark:bg-surface-800/80">
		<div class="relative flex items-center justify-center gap-4" role="list" aria-label="Widget configuration progress">
			{#each steps as step, i (i)}
				<div class="relative z-10 flex items-center gap-3" role="listitem">
					<!-- Step circle -->
					<button
						type="button"
						class="group flex items-center gap-3 rounded-lg px-4 py-2 transition-all duration-200
						{i === currentStep ? 'bg-tertiary-100 dark:bg-tertiary-900/30' : stepCompleted[i] ? 'bg-surface-100 dark:bg-surface-700' : ''}
						{stepClickable[i] || i === currentStep ? 'cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-700' : 'cursor-not-allowed opacity-60'}"
						aria-current={i === currentStep ? 'step' : undefined}
						aria-label={`${step.label} – ${stepCompleted[i] ? 'Completed' : i === currentStep ? 'Current step' : 'Pending step'}`}
						disabled={!(stepClickable[i] || i === currentStep)}
						onclick={() => handleStepClick(i)}
					>
						<!-- Circle indicator -->
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200
							{stepCompleted[i]
								? 'bg-tertiary-500 dark:bg-primary-500 text-white'
								: i === currentStep
									? 'bg-error-500 text-white shadow-lg ring-4 ring-error-500/20'
									: 'bg-surface-200 text-surface-500 dark:bg-surface-600 dark:text-surface-300'}"
						>
							{#if stepCompleted[i]}
								<iconify-icon icon="mdi:check" width="20"></iconify-icon>
							{:else}
								<iconify-icon icon={step.icon} width="20"></iconify-icon>
							{/if}
						</div>

						<!-- Label -->
						<div class="hidden sm:block text-left">
							<div
								class="font-semibold {i === currentStep
									? 'text-tertiary-600 dark:text-primary-400'
									: stepCompleted[i]
										? 'text-surface-700 dark:text-surface-200'
										: 'text-surface-400 dark:text-surface-500'}"
							>
								{step.label}
							</div>
							<div class="text-xs {i <= currentStep ? 'text-surface-500 dark:text-surface-400' : 'text-surface-400 dark:text-surface-500'}">
								{step.shortDesc}
							</div>
						</div>
					</button>
				</div>

				<!-- Connecting line (except last) -->
				{#if i !== steps.length - 1}
					<div
						class="h-0.5 w-16 lg:w-24 transition-all duration-300 {stepCompleted[i]
							? 'bg-tertiary-500 dark:bg-primary-500'
							: 'bg-surface-200 dark:bg-surface-600'}"
					></div>
				{/if}
			{/each}
		</div>
	</div>
</div>
