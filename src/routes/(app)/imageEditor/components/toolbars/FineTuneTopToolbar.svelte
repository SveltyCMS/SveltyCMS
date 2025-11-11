<!--
@file src/routes/(app)/imageEditor/FineTuneTopToolbar.svelte
@component
**Fine-tune tool top toolbar - Pintura-style slider interface**
Displays a single slider at the top of the editor for the selected adjustment.

### Props
- `activeAdjustment`: Currently selected adjustment type
- `adjustmentValue`: Current value of the active adjustment
- `onValueChange`: Function called when slider value changes
- `onComparisonStart`: Function called when before/after comparison starts
- `onComparisonEnd`: Function called when before/after comparison ends
- `onReset`: Function called when reset button is clicked
- `onApply`: Function called when apply button is clicked
-->

<script lang="ts">
	interface Props {
		activeAdjustment: string;
		adjustmentValue: number;
		onValueChange: (value: number) => void;
		onComparisonStart: () => void;
		onComparisonEnd: () => void;
		onReset: () => void;
		onApply: () => void;
		onAdjustmentChange: (adjustment: string) => void;
	}

	let { activeAdjustment, adjustmentValue, onValueChange, onComparisonStart, onComparisonEnd, onReset, onApply, onAdjustmentChange }: Props =
		$props();

	// Available adjustments
	const adjustments = [
		{ id: 'brightness', label: 'Brightness' },
		{ id: 'contrast', label: 'Contrast' },
		{ id: 'saturation', label: 'Saturation' },
		{ id: 'temperature', label: 'Temperature' },
		{ id: 'exposure', label: 'Exposure' },
		{ id: 'highlights', label: 'Highlights' },
		{ id: 'shadows', label: 'Shadows' },
		{ id: 'clarity', label: 'Clarity' },
		{ id: 'vibrance', label: 'Vibrance' }
	];

	// State for dropdown visibility
	let dropdownOpen = $state(false);

	// Handle adjustment change from dropdown
	function handleAdjustmentChange(adjustment: string) {
		onAdjustmentChange(adjustment);
		dropdownOpen = false;
	}

	// Handle slider input
	function handleSliderInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const value = parseInt(input.value);
		onValueChange(value);
	}

	// Handle number input
	function handleNumberInput(e: Event) {
		const input = e.target as HTMLInputElement;
		let value = parseInt(input.value);

		// Handle empty input
		if (isNaN(value)) {
			value = 0;
		}

		// Clamp value to valid range
		const { min, max } = getSliderRange();
		value = Math.max(min, Math.min(max, value));

		onValueChange(value);
	}

	// Get min/max values for different adjustments
	function getSliderRange() {
		switch (activeAdjustment) {
			case 'temperature':
				return { min: -100, max: 100 };
			default:
				return { min: -100, max: 100 };
		}
	}

	const { min, max } = getSliderRange();

	// Toggle dropdown
	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	// Close dropdown when clicking outside
	function handleClickOutside() {
		dropdownOpen = false;
	}
</script>

<div class="finetune-top-toolbar" onclick={handleClickOutside}>
	<!-- Adjustment dropdown and number input -->
	<div class="adjustment-controls">
		<!-- Custom dropdown with arrow -->
		<div class="custom-dropdown" class:open={dropdownOpen} onclick={(e) => e.stopPropagation()}>
			<button
				class="dropdown-button"
				onclick={(e) => {
					e.stopPropagation();
					toggleDropdown();
				}}
				aria-label="Select adjustment type"
				aria-expanded={dropdownOpen}
			>
				{adjustments.find((a) => a.id === activeAdjustment)?.label || 'Select Adjustment'}
				<iconify-icon icon="mdi:chevron-down" width="16" class="dropdown-arrow" class:rotate={dropdownOpen}></iconify-icon>
			</button>

			{#if dropdownOpen}
				<div class="dropdown-menu">
					{#each adjustments as adjustment (adjustment.id)}
						<button
							class="dropdown-option"
							class:selected={adjustment.id === activeAdjustment}
							onclick={(e) => {
								e.stopPropagation();
								handleAdjustmentChange(adjustment.id);
							}}
						>
							{adjustment.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<!-- Number input field -->
		<div class="number-input-container">
			<input
				type="number"
				{min}
				{max}
				step="1"
				value={adjustmentValue}
				oninput={handleNumberInput}
				class="number-input"
				aria-label="Adjustment value"
			/>
		</div>
	</div>

	<!-- Main slider -->
	<div class="slider-container">
		<input
			type="range"
			{min}
			{max}
			step="1"
			value={adjustmentValue}
			oninput={handleSliderInput}
			class="adjustment-slider"
			aria-label="Adjust {activeAdjustment}"
		/>
	</div>

	<!-- Action buttons -->
	<div class="action-buttons">
		<button
			class="comparison-btn"
			onmousedown={onComparisonStart}
			onmouseup={onComparisonEnd}
			onmouseleave={onComparisonEnd}
			ontouchstart={onComparisonStart}
			ontouchend={onComparisonEnd}
			aria-label="Hold to see original image"
			title="Hold to compare with original"
		>
			<iconify-icon icon="mdi:compare" width="18"></iconify-icon>
		</button>

		<button onclick={onReset} class="reset-btn" aria-label="Reset all adjustments" title="Reset all adjustments">
			<iconify-icon icon="mdi:refresh" width="18"></iconify-icon>
		</button>

		<button onclick={onApply} class="apply-btn" aria-label="Apply adjustments" title="Apply adjustments">
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		</button>
	</div>
</div>

<style>
@import "tailwindcss";
	.finetune-top-toolbar {
		@apply absolute left-0 right-0 top-0 z-40;
		@apply flex items-center justify-between gap-4;
		@apply px-4 py-3;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(10px);
	}

	.adjustment-controls {
		@apply flex min-w-0 items-center gap-3;
	}

	/* Custom dropdown styles */
	.custom-dropdown {
		@apply relative;
	}

	.dropdown-button {
		@apply flex items-center justify-between;
		@apply bg-transparent text-sm font-medium text-white;
		@apply rounded px-2 py-1;
		@apply transition-all duration-200;
		@apply cursor-pointer;
		@apply border border-transparent;
		text-transform: capitalize;
		min-width: 120px;
	}

	.dropdown-button:hover {
		background-color: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.dropdown-button:focus {
		outline: 2px solid rgb(var(--color-primary-500) / 0.8);
		outline-offset: 2px;
	}

	.dropdown-arrow {
		@apply transition-transform duration-200;
	}

	.dropdown-arrow.rotate {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		@apply absolute left-0 top-full mt-1;
		@apply bg-black/90 backdrop-blur-md;
		@apply rounded-lg shadow-lg;
		@apply z-50;
		@apply min-w-full;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.dropdown-option {
		@apply block w-full text-left;
		@apply px-3 py-2 text-sm text-white;
		@apply transition-colors duration-150;
		@apply cursor-pointer;
		@apply border-b border-white/10 last:border-b-0;
	}

	.dropdown-option:first-child {
		@apply rounded-t-lg;
	}

	.dropdown-option:last-child {
		@apply rounded-b-lg;
	}

	.dropdown-option:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}

	.dropdown-option.selected {
		background-color: rgb(var(--color-primary-500) / 0.3);
		color: white;
	}

	/* Number input styles */
	.number-input-container {
		@apply flex items-center;
	}

	.number-input {
		@apply h-8 w-16 text-center;
		@apply bg-white/10 text-sm text-white;
		@apply rounded border border-white/20;
		@apply transition-all duration-200;
		@apply focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50;
	}

	.number-input:hover {
		background-color: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.number-input:focus {
		background-color: rgba(255, 255, 255, 0.2);
	}

	/* Remove number input arrows for cleaner look */
	.number-input::-webkit-inner-spin-button,
	.number-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.number-input[type='number'] {
		-moz-appearance: textfield;
	}

	.slider-container {
		@apply flex flex-1 items-center justify-center px-4;
		max-width: 500px;
	}

	.adjustment-slider {
		@apply h-2 w-full cursor-pointer appearance-none rounded-full;
		background: linear-gradient(
			to right,
			rgb(var(--color-surface-400) / 0.3) 0%,
			rgb(var(--color-primary-500) / 0.8) 50%,
			rgb(var(--color-surface-400) / 0.3) 100%
		);
	}

	.adjustment-slider::-webkit-slider-thumb {
		@apply h-5 w-5 cursor-pointer appearance-none rounded-full;
		background-color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		border: 2px solid rgb(var(--color-primary-500) / 1);
	}

	.adjustment-slider::-moz-range-thumb {
		@apply h-5 w-5 cursor-pointer rounded-full border-2;
		background-color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		border-color: rgb(var(--color-primary-500) / 1);
	}

	.action-buttons {
		@apply flex items-center gap-2;
	}

	.comparison-btn,
	.reset-btn,
	.apply-btn {
		@apply flex items-center justify-center;
		@apply h-10 w-10 rounded-lg;
		@apply transition-all duration-200;
	}

	.comparison-btn {
		background-color: rgba(255, 255, 255, 0.1);
		color: rgb(var(--color-surface-50) / 1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.comparison-btn:hover {
		background-color: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	.comparison-btn:active {
		background-color: rgba(255, 255, 255, 0.3);
		transform: scale(0.95);
	}

	.reset-btn {
		background-color: rgba(255, 255, 255, 0.1);
		color: rgb(var(--color-surface-50) / 1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.reset-btn:hover {
		background-color: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	.reset-btn:active {
		transform: scale(0.95);
	}

	.apply-btn {
		background-color: rgb(250, 204, 21);
		color: rgb(30, 30, 30);
	}

	.apply-btn:hover {
		background-color: rgb(234, 179, 8);
		transform: scale(1.05);
	}

	.apply-btn:active {
		transform: scale(0.95);
	}
</style>
