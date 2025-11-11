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
	.finetune-top-toolbar {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 0.75rem; padding-bottom: 0.75rem;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(10px);
	}

	.adjustment-controls {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.75rem;
	}

	/* Custom dropdown styles */
	.custom-dropdown {
		position: relative;
	}

	.dropdown-button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 500;
		color: rgb(255 255 255);
		border-radius: 0.25rem;
		padding-left: 0.5rem; padding-right: 0.5rem;
		/* @apply transition-all duration-200; */
		cursor: pointer;
		border-width: 1px;
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
		/* @apply transition-transform duration-200; */
	}

	.dropdown-arrow.rotate {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		position: absolute;
		/* @apply bg-black/90 backdrop-blur-md; */
		border-radius: 0.5rem;
		/* @apply z-50; */
		/* @apply min-w-full; */
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.dropdown-option {
		display: block;
		width: 100%;
		text-align: left;
		padding-left: 0.75rem; padding-right: 0.75rem;
		padding-top: 0.5rem; padding-bottom: 0.5rem;
		font-size: 0.875rem; line-height: 1.25rem;
		color: rgb(255 255 255);
		/* @apply transition-colors duration-150; */
		cursor: pointer;
		border-bottom-width: 1px;
	}

	.dropdown-option:first-child {
		/* @apply rounded-t-lg; */
	}

	.dropdown-option:last-child {
		/* @apply rounded-b-lg; */
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
		display: flex;
		align-items: center;
	}

	.number-input {
		text-align: center;
		font-size: 0.875rem; line-height: 1.25rem;
		color: rgb(255 255 255);
		border-radius: 0.25rem;
		border-width: 1px;
		/* @apply transition-all duration-200; */
		/* @apply focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50; */
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
		display: flex;
		flex: 1 1 0%;
		align-items: center;
		justify-content: center;
		padding-left: 1rem; padding-right: 1rem;
		max-width: 500px;
	}

	.adjustment-slider {
		width: 100%;
		cursor: pointer;
		border-radius: 9999px;
		background: linear-gradient(
			to right,
			rgb(var(--color-surface-400) / 0.3) 0%,
			rgb(var(--color-primary-500) / 0.8) 50%,
			rgb(var(--color-surface-400) / 0.3) 100%
		);
	}

	.adjustment-slider::-webkit-slider-thumb {
		cursor: pointer;
		border-radius: 9999px;
		background-color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		border: 2px solid rgb(var(--color-primary-500) / 1);
	}

	.adjustment-slider::-moz-range-thumb {
		cursor: pointer;
		border-radius: 9999px;
		background-color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		border-color: rgb(var(--color-primary-500) / 1);
	}

	.action-buttons {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.comparison-btn,
	.reset-btn,
	.apply-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		/* @apply transition-all duration-200; */
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
