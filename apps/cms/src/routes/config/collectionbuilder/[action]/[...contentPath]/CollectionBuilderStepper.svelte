<!--
@file apps/cms/src/routes/config/collectionbuilder/[action]/[...contentPath]/CollectionBuilderStepper.svelte
@component Collection builder stepper navigation with polished UI
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

<div class="w-full lg:w-80 xl:w-96 shrink-0">
	<div
		class="overflow-hidden rounded-2xl border border-surface-200/50 bg-white/80 shadow-2xl backdrop-blur-xl dark:border-surface-600/50 dark:bg-surface-800/80"
	>
		<!-- Header -->
		<div class="border-b border-surface-200/50 bg-gradient-to-r from-tertiary-500/10 to-primary-500/10 px-6 py-4 dark:border-surface-600/50">
			<h3 class="font-bold text-surface-800 dark:text-white">Collection Builder</h3>
			<p class="text-sm text-surface-500 dark:text-surface-400">Configure your collection</p>
		</div>

		<!-- Mobile: Horizontal step indicator -->
		<div class="relative flex items-start justify-between px-4 py-6 lg:hidden" role="list" aria-label="Collection builder progress">
			{#each steps as step, i (i)}
				<div class="relative z-10 flex flex-1 flex-col items-center" role="listitem">
					<button
						type="button"
						class="group flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-tertiary-500
						{stepCompleted[i]
							? 'bg-gradient-to-br from-tertiary-500 to-primary-500 text-white shadow-lg shadow-tertiary-500/30'
							: i === currentStep
								? 'bg-gradient-to-br from-error-500 to-error-600 text-white shadow-lg shadow-error-500/30 ring-4 ring-error-500/20 animate-pulse'
								: 'bg-surface-100 text-surface-400 dark:bg-surface-700 dark:text-surface-400'}
						{stepClickable[i] || i === currentStep ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed opacity-60'}"
						aria-current={i === currentStep ? 'step' : undefined}
						aria-label={`${step.label} – ${stepCompleted[i] ? 'Completed' : i === currentStep ? 'Current step' : 'Pending step'}`}
						disabled={!(stepClickable[i] || i === currentStep)}
						onclick={() => handleStepClick(i)}
					>
						{#if stepCompleted[i]}
							<iconify-icon icon="mdi:check" width="24"></iconify-icon>
						{:else}
							<iconify-icon icon={step.icon} width="24"></iconify-icon>
						{/if}
					</button>
					<div class="mt-3 text-center">
						<span class="text-xs font-medium {i <= currentStep ? 'text-surface-800 dark:text-white' : 'text-surface-400'}">
							{step.label}
						</span>
					</div>
				</div>
			{/each}

			<!-- Connecting lines for mobile -->
			<div class="absolute left-16 right-16 top-10 flex items-center" aria-hidden="true">
				{#each Array.from({ length: steps.length - 1 }, (_, i) => i) as i (i)}
					<div
						class="h-1 flex-1 mx-1 rounded-full transition-all duration-500 {stepCompleted[i]
							? 'bg-gradient-to-r from-tertiary-500 to-primary-500'
							: 'bg-surface-200 dark:bg-surface-600'}"
					></div>
				{/each}
			</div>
		</div>

		<!-- Desktop: Vertical step indicator -->
		<div class="hidden p-4 lg:block">
			{#each steps as step, i (i)}
				<div class="relative">
					<button
						class="group flex w-full items-start gap-4 rounded-xl p-4 transition-all duration-200
						{i === currentStep ? 'bg-tertiary-50/50 dark:bg-tertiary-900/20' : ''}
						{stepClickable[i] || i === currentStep ? 'hover:bg-surface-50 dark:hover:bg-surface-700/50' : 'cursor-not-allowed opacity-60'}"
						disabled={!(stepClickable[i] || i === currentStep)}
						onclick={() => handleStepClick(i)}
					>
						<!-- Step circle -->
						<div
							class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300
							{stepCompleted[i]
								? 'bg-gradient-to-br from-tertiary-500 to-primary-500 text-white shadow-lg shadow-tertiary-500/30'
								: i === currentStep
									? 'bg-gradient-to-br from-error-500 to-error-600 text-white shadow-lg shadow-error-500/30 ring-4 ring-error-500/20'
									: 'bg-surface-100 text-surface-400 dark:bg-surface-700 dark:text-surface-400 group-hover:bg-surface-200 dark:group-hover:bg-surface-600'}"
						>
							{#if stepCompleted[i]}
								<iconify-icon icon="mdi:check" width="20" class="animate-bounce"></iconify-icon>
							{:else}
								<iconify-icon icon={step.icon} width="20"></iconify-icon>
							{/if}
						</div>

						<!-- Step text -->
						<div class="flex-1 text-left">
							<div
								class="font-semibold transition-colors {i === currentStep
									? 'text-tertiary-600 dark:text-primary-400'
									: i < currentStep
										? 'text-surface-700 dark:text-surface-200'
										: 'text-surface-400 dark:text-surface-500'}"
							>
								{step.label}
							</div>
							<div class="mt-0.5 text-sm {i <= currentStep ? 'text-surface-500 dark:text-surface-400' : 'text-surface-400 dark:text-surface-500'}">
								{step.shortDesc}
							</div>
						</div>

						<!-- Status indicator -->
						{#if i === currentStep}
							<div
								class="flex h-6 items-center justify-center rounded-full bg-error-100 px-2 text-xs font-medium text-error-600 dark:bg-error-900/30 dark:text-error-400"
							>
								Current
							</div>
						{:else if stepCompleted[i]}
							<div
								class="flex h-6 items-center justify-center rounded-full bg-tertiary-100 px-2 text-xs font-medium text-tertiary-600 dark:bg-tertiary-900/30 dark:text-tertiary-400"
							>
								Done
							</div>
						{/if}
					</button>

					<!-- Connecting line -->
					{#if i !== steps.length - 1}
						<div
							class="absolute left-8 top-14 h-4 w-0.5 transition-all duration-500
							{stepCompleted[i] ? 'bg-gradient-to-b from-tertiary-500 to-primary-500' : 'bg-surface-200 dark:bg-surface-600'}"
						></div>
					{/if}
				</div>
			{/each}

			<!-- Progress indicator -->
			<div class="mt-6 border-t border-surface-200/50 pt-4 dark:border-surface-600/50">
				<div class="flex items-center justify-between text-sm">
					<span class="text-surface-500 dark:text-surface-400">Progress</span>
					<span class="font-semibold text-tertiary-600 dark:text-primary-400">
						{stepCompleted.filter(Boolean).length}/{steps.length} Complete
					</span>
				</div>
				<div class="mt-2 h-2 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-600">
					<div
						class="h-full rounded-full bg-gradient-to-r from-tertiary-500 to-primary-500 transition-all duration-500"
						style="width: {(stepCompleted.filter(Boolean).length / steps.length) * 100}%"
					></div>
				</div>
			</div>
		</div>
	</div>
</div>
