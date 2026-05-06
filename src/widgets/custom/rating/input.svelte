<!--
@file src/widgets/custom/Rating/Input.svelte
@component
**Rating Widget Input Component**

Provides interactive star rating input without Skeleton Labs dependency.
Part of the Three Pillars Architecture for widget system.
-->

<script lang="ts">
	import type { FieldType } from './';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value?: number | null | undefined;
		error?: string | null;
	} = $props();

	const max = $derived(Math.max(1, Math.floor(Number(field.max) || 5)));
	const step = $derived(Number(field.step) === 0.5 ? 0.5 : 1);
	const showValue = $derived(field.showValue !== false);
	const ratingValue = $derived(typeof value === 'number' ? value : 0);

	let hoverValue = $state<number | null>(null);

	const displayValue = $derived(hoverValue ?? ratingValue);

	const iconFull = $derived((field.iconFull as string) || 'material-symbols:star');
	const iconHalf = $derived((field.iconHalf as string) || 'material-symbols:star-half');
	const iconEmpty = $derived((field.iconEmpty as string) || 'material-symbols:star-outline');

	function setRating(nextValue: number) {
		if (!field.required && value === nextValue) {
			value = null;
			return;
		}

		value = nextValue;
	}

	function handlePointerSelect(event: MouseEvent, index: number) {
		if (step === 0.5) {
			const target = event.currentTarget as HTMLElement;
			const rect = target.getBoundingClientRect();
			const isHalf = event.clientX - rect.left < rect.width / 2;
			setRating(index + (isHalf ? 0.5 : 1));
			return;
		}

		setRating(index + 1);
	}

	function handlePointerMove(event: MouseEvent, index: number) {
		if (step === 0.5) {
			const target = event.currentTarget as HTMLElement;
			const rect = target.getBoundingClientRect();
			const isHalf = event.clientX - rect.left < rect.width / 2;
			hoverValue = index + (isHalf ? 0.5 : 1);
			return;
		}

		hoverValue = index + 1;
	}

	function handleKeydown(event: KeyboardEvent, index: number) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			setRating(index + 1);
		}

		if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
			event.preventDefault();
			setRating(Math.min(max, ratingValue + step));
		}

		if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
			event.preventDefault();
			const nextValue = Math.max(field.required ? step : 0, ratingValue - step);
			value = nextValue === 0 && !field.required ? null : nextValue;
		}
	}

	function handleClear() {
		value = field.required ? 1 : null;
	}

	function getIcon(index: number) {
		const starValue = index + 1;

		if (displayValue >= starValue) {
			return iconFull;
		}

		if (step === 0.5 && displayValue >= starValue - 0.5) {
			return iconHalf;
		}

		return iconEmpty;
	}

	function getIconClass(index: number) {
		const starValue = index + 1;

		if (displayValue >= starValue || (step === 0.5 && displayValue >= starValue - 0.5)) {
			return error ? 'text-error-500' : 'text-warning-500';
		}

		return 'text-surface-300 dark:text-surface-600';
	}
</script>

<div
	class="relative flex flex-col gap-2 rounded-lg border border-surface-400 bg-white p-3 transition-all dark:border-surface-600 dark:bg-surface-900"
	class:ring-2={!!error}
	class:ring-error-500={!!error}
	class:border-error-500={!!error}
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<div class="flex gap-0.5" role="radiogroup" aria-label={field.label}>
				{#each Array(max) as _, i}
					<button
						type="button"
						role="radio"
						aria-checked={ratingValue === i + 1}
						aria-label={`${i + 1} of ${max}`}
						class="rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary-500"
						onclick={(event) => handlePointerSelect(event, i)}
						onmousemove={(event) => handlePointerMove(event, i)}
						onfocus={() => (hoverValue = i + 1)}
						onblur={() => (hoverValue = null)}
						onmouseleave={() => (hoverValue = null)}
						onkeydown={(event) => handleKeydown(event, i)}
					>
						<iconify-icon icon={getIcon(i)} width="28" class={getIconClass(i)}></iconify-icon>
					</button>
				{/each}
			</div>

			{#if showValue}
				<span class="min-w-8 text-center text-lg font-bold text-surface-900 dark:text-surface-50">
					{value?.toFixed(step === 0.5 ? 1 : 0) || '0'}
				</span>
			{/if}
		</div>

		{#if !field.required || (value !== null && value !== undefined)}
			<button
				type="button"
				class="btn btn-sm variant-soft-surface p-1 opacity-60 transition-opacity hover:opacity-100"
				onclick={handleClear}
				title="Reset Rating"
				aria-label="Reset Rating"
			>
				<iconify-icon icon="mdi:refresh" width="18"></iconify-icon>
			</button>
		{/if}
	</div>

	{#if error}
		<p class="text-xs font-medium text-error-500" role="alert">{error}</p>
	{/if}
</div>