<!--
@file src/components/system/Stepper.svelte
@description A reusable Stepper component (Responsive: Horizontal Mobile / Vertical Desktop).
-->
<script lang="ts">
	interface Step {
		label: string;
		shortDesc?: string;
		icon?: string; // Optional icon override
	}

	interface Props {
		steps: Step[];
		currentStep: number;
		stepCompleted?: boolean[]; // Array of completion status
		stepClickable?: boolean[]; // Array of clickable status (for navigation)
		onselectStep?: (index: number) => void;

		// Snippets for customization
		header?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}

	let { steps, currentStep = $bindable(0), stepCompleted = [], stepClickable = [], onselectStep, header, footer }: Props = $props();

	// Default to all clickable/uncompleted if not provided
	let derivedCompleted = $derived(stepCompleted.length ? stepCompleted : steps.map((_, i) => i < currentStep));
	let derivedClickable = $derived(stepClickable.length ? stepClickable : steps.map((_, i) => i <= currentStep));

	function handleStepClick(index: number) {
		if (derivedClickable[index]) {
			currentStep = index;
			onselectStep?.(index);
		}
	}
</script>

<div
	class="h-full w-full shrink-0 flex flex-col rounded-xl border border-surface-200 bg-white shadow-sm dark:text-surface-50 dark:bg-surface-800 lg:w-64 xl:w-72"
>
	<!-- Mobile: Horizontal Step Indicator -->
	<div class="relative flex items-start justify-between p-4 lg:hidden" role="list">
		{#each steps as step, i (i)}
			<div class="relative z-10 flex flex-1 flex-col items-center" role="listitem">
				<button
					type="button"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-10 sm:w-10 sm:text-sm
					{derivedCompleted[i]
						? 'bg-primary-500 text-white'
						: i === currentStep
							? 'bg-tertiary-500 text-white dark:bg-primary-500'
							: 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-50'} 
					{derivedClickable[i] ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}"
					disabled={!derivedClickable[i]}
					onclick={() => handleStepClick(i)}
					aria-current={i === currentStep ? 'step' : undefined}
				>
					<span class="text-[0.65rem]">{derivedCompleted[i] ? '✓' : i + 1}</span>
				</button>
				<div class="mt-2 text-center">
					<div
						class="max-w-16 truncate text-xs font-medium sm:max-w-20 sm:text-sm {i <= currentStep
							? 'text-surface-900 dark:text-white'
							: 'text-surface-500 dark:text-surface-50'}"
					>
						{step.label.split(' ')[0]}
					</div>
				</div>
			</div>
		{/each}
		<!-- Connecting Line -->
		<div class="absolute left-0 right-0 top-8 flex h-0.5 px-12 sm:top-9" aria-hidden="true">
			<div class="h-full w-full bg-surface-200 dark:bg-surface-700"></div>
		</div>
	</div>

	<!-- Desktop: Vertical Step Indicator -->
	<div class="hidden h-full flex-col p-4 lg:flex">
		{#if header}
			<div class="mb-4">
				{@render header()}
			</div>
		{/if}

		<div class="flex flex-1 flex-col gap-2 overflow-y-auto">
			{#each steps as step, i (i)}
				<div class="relative">
					<button
						class="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-all
						{i === currentStep ? 'bg-primary-50 dark:bg-primary-500/10' : ''} 
						{derivedClickable[i] ? 'hover:bg-surface-100 dark:hover:bg-surface-700' : 'cursor-not-allowed opacity-50'}"
						disabled={!derivedClickable[i]}
						onclick={() => handleStepClick(i)}
						aria-current={i === currentStep ? 'step' : undefined}
					>
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white transition-all dark:ring-surface-800
							{derivedCompleted[i]
								? 'bg-primary-500 text-white'
								: i === currentStep
									? 'bg-tertiary-500 text-white dark:bg-primary-500'
									: 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-50'}"
						>
							{derivedCompleted[i] ? '✓' : i + 1}
						</div>
						<div>
							<div
								class="text-sm font-medium {i === currentStep ? 'text-primary-700 dark:text-primary-400' : 'text-surface-600 dark:text-surface-300'}"
							>
								{step.label}
							</div>
							{#if step.shortDesc}
								<div class="text-xs text-surface-500 dark:text-surface-50">
									{step.shortDesc}
								</div>
							{/if}
						</div>
					</button>
					{#if i !== steps.length - 1}
						<div class="absolute left-[1.35rem] top-10 h-6 w-[2px] bg-surface-200 dark:bg-surface-700"></div>
					{/if}
				</div>
			{/each}
		</div>

		{#if footer}
			<div class="mt-4 border-t border-surface-200 pt-4 dark:text-surface-50">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>
