<!-- 
 @src/routes/api/cms.ts src/components/ui/stepper.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Stepper Primitive
-->
<script lang="ts">
interface Step {
	label: string;
	description?: string;
	icon?: string;
}

let {
	steps = [],
	currentStep = 0,
	completedSteps = new Set(),
	orientation = "vertical",
	compact = false,
	onStepClick = (_index: number) => {},
} = $props<{
	steps: Step[];
	currentStep: number;
	completedSteps: Set<number>;
	orientation?: "horizontal" | "vertical";
	compact?: boolean;
	onStepClick?: (index: number) => void;
}>();

function isClickable(index: number) {
	// Allow clicking completed steps or the next one
	return completedSteps.has(index) || index <= currentStep + 1;
}
</script>

<div class="stepper-container {orientation === 'vertical' ? 'flex-col space-y-4' : 'flex-row space-x-4 items-center justify-between'} flex w-full">
	{#each steps as step, i}
		<div class="step-item flex-1 relative group">
			<button
				type="button"
				class="w-full flex {orientation === 'vertical' ? 'items-start text-left' : 'flex-col items-center text-center'} {compact ? 'p-1 justify-center' : 'p-3'} gap-4 rounded-xl transition-all
					{i === currentStep ? 'bg-primary-500/10 dark:bg-primary-500/20 ring-1 ring-primary-500' : 'hover:bg-surface-100 dark:hover:bg-surface-800'}
					{isClickable(i) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}"
				onclick={() => isClickable(i) && onStepClick(i)}
				disabled={!isClickable(i)}
				aria-current={i === currentStep ? 'step' : undefined}
			>
				<!-- Step Indicator -->
				<div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all
					{completedSteps.has(i) ? 'bg-success-500 text-white' : 
					 i === currentStep ? 'bg-primary-500 text-white shadow-lg scale-110' : 
					 'bg-surface-200 dark:bg-surface-700 text-surface-500'}">
					{#if completedSteps.has(i)}
						<iconify-icon icon="mdi:check" width="20"></iconify-icon>
					{:else if step.icon}
						<iconify-icon icon={step.icon} width="20"></iconify-icon>
					{:else}
						{i + 1}
					{/if}
				</div>

				<!-- Step Text -->
				{#if !compact}
					<div class="min-w-0">
						<p class="font-bold text-sm {i === currentStep ? 'text-primary-600 dark:text-primary-400' : 'text-surface-900 dark:text-surface-100'}">
							{step.label}
						</p>
						{#if step.description && orientation === 'vertical'}
							<p class="text-xs text-surface-500 truncate">{step.description}</p>
						{/if}
					</div>
				{/if}
			</button>

			<!-- Connecting Line -->
			{#if i < steps.length - 1}
				<div class="{orientation === 'vertical' ? 'absolute left-7 top-11 w-0.5 h-6' : 'hidden'} 
					-z-10 {completedSteps.has(i) ? 'bg-success-500' : 'bg-surface-200 dark:bg-surface-700'}"></div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.stepper-container {
		user-select: none;
	}
</style>
