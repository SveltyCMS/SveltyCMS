<!--
@file src/components/ui/stepper.svelte
@component
**SveltyCMS Stepper — WCAG 3.0 Ready**

Shared multi-step progress used by Setup Wizard and Collection Builder.

### Props
- `steps` (Step[]): `{ label, description?, shortDesc?, icon? }`
- `currentStep` (number): Zero-based active step index
- `completedSteps` (Set<number> | boolean[]): completed indices (Set or parallel flags)
- `stepClickable` (boolean[]): optional per-step clickability (Setup); else completed + next
- `orientation` ('horizontal' | 'vertical')
- `variant` ('default' | 'setup'): setup keeps Setup Wizard colors (error = current, tertiary = done)
- `compact` (boolean): smaller chrome
- `mobileTruncate` (boolean): show first word of label only (setup mobile)
- `showLines` (boolean): connecting lines (default true)
- `onStepClick` (index) => void

### Features:
- `aria-current="step"`, keyboard-friendly buttons
- check / icon / index indicators
- horizontal + vertical layouts with connectors
- full Svelte 5 runes
-->
<script lang="ts" module>
	export interface StepperStep {
		label: string;
		description?: string;
		/** Alias used by Setup Wizard */
		shortDesc?: string;
		icon?: string;
		id?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		steps?: StepperStep[];
		currentStep?: number;
		/** Preferred: Set of completed indices. Also accepts boolean[] from Setup. */
		completedSteps?: Set<number> | boolean[];
		/** When set, overrides default click rules (Setup wizard). */
		stepClickable?: boolean[];
		orientation?: "horizontal" | "vertical";
		/** `setup` matches Setup Wizard chrome (minimal visual change for setup). */
		variant?: "default" | "setup";
		compact?: boolean;
		/** Truncate labels to first word (setup mobile strip). */
		mobileTruncate?: boolean;
		showLines?: boolean;
		class?: string;
		onStepClick?: (index: number) => void;
		/** Optional footer (e.g. setup legend) */
		footer?: Snippet;
	}

	let {
		steps = [],
		currentStep = 0,
		completedSteps = new Set<number>(),
		stepClickable,
		orientation = "vertical",
		variant = "default",
		compact = false,
		mobileTruncate = false,
		showLines = true,
		class: className = "",
		onStepClick = (_index: number) => {},
		footer,
	}: Props = $props();

	function isCompleted(index: number): boolean {
		if (Array.isArray(completedSteps)) return !!completedSteps[index];
		return completedSteps.has(index);
	}

	function isClickable(index: number): boolean {
		if (stepClickable && stepClickable.length > 0) {
			return !!stepClickable[index] || index === currentStep;
		}
		return isCompleted(index) || index <= currentStep + 1;
	}

	function displayLabel(step: StepperStep): string {
		if (mobileTruncate) return step.label.split(" ")[0] ?? step.label;
		return step.label;
	}

	function desc(step: StepperStep): string | undefined {
		return step.description ?? step.shortDesc;
	}

	function indicatorClass(index: number): string {
		const done = isCompleted(index);
		const current = index === currentStep;
		if (variant === "setup") {
			if (done) return "bg-tertiary-500 dark:bg-primary-500 text-white";
			if (current) return "bg-error-500 text-white shadow-xl";
			return orientation === "vertical"
				? "bg-slate-200 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600"
				: "bg-surface-200 text-surface-500 dark:bg-surface-500/10 dark:text-surface-50";
		}
		if (done) return "bg-success-500 text-white";
		if (current) return "bg-tertiary-500 dark:bg-primary-500 text-white shadow-lg scale-110";
		return "bg-surface-200 dark:bg-surface-700 text-surface-500";
	}

	function labelClass(index: number): string {
		if (variant === "setup") {
			if (index < currentStep) return "text-slate-800 dark:text-slate-200";
			if (index === currentStep) return "text-slate-900 dark:text-white";
			return "text-slate-400 dark:text-slate-600";
		}
		if (index === currentStep) return "text-tertiary-600 dark:text-primary-600";
		return "text-surface-900 dark:text-surface-100";
	}

	function descClass(index: number): string {
		if (variant === "setup") {
			if (index < currentStep) return "text-slate-500 dark:text-slate-400";
			if (index === currentStep) return "text-slate-600 dark:text-slate-300";
			return "text-slate-400 dark:text-slate-600";
		}
		return "text-surface-500";
	}

	function lineCompletedClass(index: number): string {
		if (!isCompleted(index)) {
			return variant === "setup"
				? orientation === "horizontal"
					? "border-t-2 border-dashed border-slate-200 bg-transparent"
					: "border-s-2 border-dashed border-slate-200 bg-transparent"
				: "bg-surface-200 dark:bg-surface-700";
		}
		return variant === "setup"
			? "bg-tertiary-500 dark:bg-primary-500"
			: "bg-success-500";
	}
</script>

<div
	class="stepper-container flex w-full {orientation === 'vertical'
		? 'flex-col'
		: 'flex-row items-stretch justify-between gap-1 sm:gap-2'} {className}"
	role="list"
	aria-label="Progress"
>
	{#each steps as step, i (step.id ?? i)}
		{@const clickable = isClickable(i)}
		{@const done = isCompleted(i)}
		{@const current = i === currentStep}
		{@const description = desc(step)}

		<div
			class="step-item relative group {orientation === 'vertical' ? '' : 'flex-1'}"
			role="listitem"
		>
			<button
				type="button"
				class="w-full rounded transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
					{orientation === 'vertical'
					? `flex items-start gap-4 text-start ${compact ? 'p-2' : variant === 'setup' ? 'p-4' : 'p-3'}`
					: `flex flex-col items-center text-center ${compact ? 'p-1 gap-1' : 'p-2 gap-2 sm:p-3'}`}
					{current && variant === 'default' && !compact
						? 'bg-tertiary-500/10 dark:bg-primary-500/20 ring-1 ring-primary-500/40'
						: ''}
					{clickable
						? variant === 'setup' && orientation === 'vertical'
							? 'hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer'
							: 'hover:bg-surface-500/10 dark:hover:bg-surface-800 cursor-pointer'
						: 'cursor-not-allowed opacity-50'}"
				onclick={() => clickable && onStepClick(i)}
				disabled={!clickable}
				aria-current={current ? 'step' : undefined}
				aria-label={`${step.label} – ${done ? 'Completed' : current ? 'Current step' : 'Pending step'}`}
				tabindex={clickable ? 0 : -1}
			>
				<!-- Indicator -->
				<div
					class="relative z-10 flex shrink-0 items-center justify-center rounded-full font-bold transition-all
						{orientation === 'horizontal' && variant === 'setup'
						? 'h-8 w-8 text-xs sm:h-10 sm:w-10 sm:text-sm'
						: orientation === 'vertical' && variant === 'setup'
							? 'h-6 w-6 text-sm ring-2 ring-white dark:ring-surface-800'
							: compact
								? 'h-7 w-7 text-xs'
								: 'h-8 w-8 text-sm'}
						{indicatorClass(i)}"
				>
					{#if variant === 'setup'}
						<span class="text-[0.65rem]">{done ? '✓' : current ? '●' : '•'}</span>
					{:else if done}
						<iconify-icon icon="mdi:check" width="18" aria-hidden="true"></iconify-icon>
					{:else if step.icon}
						<iconify-icon icon={step.icon} width="18" aria-hidden="true"></iconify-icon>
					{:else}
						{i + 1}
					{/if}
				</div>

				<!-- Labels -->
				{#if !compact || orientation === 'horizontal'}
					<div class="min-w-0 {orientation === 'horizontal' ? 'mt-1' : ''}">
						<p
							class="font-medium {orientation === 'horizontal'
								? `text-xs sm:text-sm ${mobileTruncate ? 'max-w-16 truncate sm:max-w-20' : ''}`
								: 'text-sm sm:text-base font-medium'} {labelClass(i)}"
						>
							{displayLabel(step)}
						</p>
						{#if description && orientation === 'vertical' && !compact}
							<p class="mt-1 text-sm {descClass(i)}">{description}</p>
						{:else if description && orientation === 'horizontal' && !compact && !mobileTruncate}
							<p class="mt-0.5 hidden text-[10px] text-surface-500 sm:block">{description}</p>
						{/if}
					</div>
				{/if}
			</button>

			<!-- Connectors -->
			{#if showLines && i < steps.length - 1}
				{#if orientation === 'vertical'}
					<div
						class="pointer-events-none absolute z-0 w-0.5
							{variant === 'setup'
							? 'inset-s-[1.65rem] top-14 h-[calc(100%-3.5rem)]'
							: 'inset-s-7 top-11 h-6'}
							{lineCompletedClass(i)}"
						aria-hidden="true"
					></div>
				{:else if orientation === 'horizontal' && variant === 'setup'}
					<div
						class="pointer-events-none absolute inset-s-1/2 top-4 -z-10 h-0.5 w-full -translate-y-1/2 sm:top-5 {lineCompletedClass(
							i,
						)}"
						aria-hidden="true"
					></div>
				{:else if orientation === 'horizontal'}
					<div
						class="pointer-events-none absolute top-5 inset-s-[calc(50%+1rem)] inset-e-[calc(-50%+1rem)] -z-10 hidden h-0.5 sm:block {isCompleted(
							i,
						)
							? 'bg-success-500'
							: 'bg-surface-200 dark:bg-surface-700'}"
						aria-hidden="true"
					></div>
				{/if}
			{/if}
		</div>
	{/each}
</div>

{#if footer}
	{@render footer()}
{/if}

<style>
	.stepper-container {
		user-select: none;
	}
</style>
