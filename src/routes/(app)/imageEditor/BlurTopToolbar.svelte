<!--
@file src/routes/(app)/imageEditor/components/BlurTopToolbar.svelte
@component
**Blur tool top toolbar - Pintura-style inline controls**
Displays blur strength slider and action buttons without blocking the canvas.

### Props
- `blurStrength`: Current blur strength value (1-50)
- `onBlurStrengthChange`: Function called when blur strength changes
- `onReset`: Function to reset blur
- `onApply`: Function to apply blur and exit
-->

<script lang="ts">
	interface Props {
		blurStrength?: number;
		onBlurStrengthChange: (value: number) => void;
		onReset: () => void;
		onApply: () => void;
	}

	let { blurStrength = $bindable(10), onBlurStrengthChange, onReset, onApply } = $props() as Props;

	function handleSliderChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const value = parseInt(input.value);
		blurStrength = value;
		onBlurStrengthChange(value);
	}
</script>

<div class="blur-top-toolbar">
	<!-- Blur strength slider -->
	<div class="slider-container">
		<iconify-icon icon="mdi:blur" width="20"></iconify-icon>
		<span class="slider-label">Blur Strength</span>
		<input
			type="range"
			min="1"
			max="50"
			value={blurStrength}
			oninput={handleSliderChange}
			class="blur-slider"
			aria-label="Blur strength"
			aria-valuemin="1"
			aria-valuemax="50"
			aria-valuenow={blurStrength}
		/>
		<span class="slider-value">{blurStrength}</span>
	</div>

	<!-- Action buttons -->
	<div class="action-buttons">
		<button onclick={onReset} class="reset-btn" title="Reset blur" aria-label="Reset blur">
			<iconify-icon icon="mdi:refresh" width="18"></iconify-icon>
			Reset
		</button>

		<button onclick={onApply} class="apply-btn" title="Apply blur and exit" aria-label="Apply blur and exit">
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
			Apply
		</button>
	</div>
</div>

<style>
	.blur-top-toolbar {
		@apply absolute left-0 right-0 top-0 z-40;
		@apply flex items-center justify-between;
		@apply gap-4 px-6 py-3;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px);
	}

	.slider-container {
		@apply flex flex-1 items-center gap-3;
		max-width: 500px;
	}

	.slider-label {
		@apply whitespace-nowrap text-sm font-medium;
		color: rgb(var(--color-surface-50) / 1);
	}

	.blur-slider {
		@apply flex-1;
		-webkit-appearance: none;
		appearance: none;
		height: 6px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.2);
		outline: none;
		cursor: pointer;
	}

	.blur-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500) / 1);
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.blur-slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
		background: rgb(var(--color-primary-400) / 1);
	}

	.blur-slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500) / 1);
		cursor: pointer;
		border: none;
		transition: all 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.blur-slider::-moz-range-thumb:hover {
		transform: scale(1.15);
		background: rgb(var(--color-primary-400) / 1);
	}

	.slider-value {
		@apply min-w-[2rem] text-center text-sm font-semibold;
		color: rgb(var(--color-surface-50) / 1);
	}

	.action-buttons {
		@apply flex items-center gap-3;
	}

	.reset-btn,
	.apply-btn {
		@apply flex items-center gap-2 rounded-lg px-4 py-2;
		@apply transition-all duration-200;
		@apply text-sm font-medium;
	}

	.reset-btn {
		background-color: rgba(239, 68, 68, 0.8);
		color: white;
	}

	.reset-btn:hover {
		background-color: rgba(239, 68, 68, 1);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
	}

	.apply-btn {
		background-color: rgba(34, 197, 94, 0.8);
		color: white;
	}

	.apply-btn:hover {
		background-color: rgba(34, 197, 94, 1);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
	}

	.reset-btn:active,
	.apply-btn:active {
		transform: translateY(0);
	}

	iconify-icon {
		color: currentColor;
	}
</style>
