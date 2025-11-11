<!--
@file src/routes/(app)/imageEditor/FineTuneBottomBar.svelte
@component
**Fine-tune tool bottom controls - Pintura-style adjustment tabs**
Displays tabs below the canvas for selecting different adjustment types.

### Props
- `activeAdjustment`: Currently selected adjustment type
- `onAdjustmentChange`: Function called when adjustment tab is clicked
-->

<script lang="ts">
	interface Props {
		activeAdjustment: string;
		onAdjustmentChange: (adjustment: string) => void;
	}

	let { activeAdjustment, onAdjustmentChange }: Props = $props();

	// Available adjustments
	const adjustments = [
		{ id: 'brightness', label: 'Brightness', icon: 'mdi:brightness-6' },
		{ id: 'contrast', label: 'Contrast', icon: 'mdi:contrast' },
		{ id: 'saturation', label: 'Saturation', icon: 'mdi:palette' },
		{ id: 'temperature', label: 'Temperature', icon: 'mdi:thermometer' },
		{ id: 'exposure', label: 'Exposure', icon: 'mdi:sun-wireless' },
		{ id: 'highlights', label: 'Highlights', icon: 'mdi:lightbulb-on' },
		{ id: 'shadows', label: 'Shadows', icon: 'mdi:lightbulb-off' },
		{ id: 'clarity', label: 'Clarity', icon: 'mdi:eye' },
		{ id: 'vibrance', label: 'Vibrance', icon: 'mdi:palette-swatch' }
	];

	function handleTabClick(adjustmentId: string) {
		onAdjustmentChange(adjustmentId);
	}
</script>

<div class="finetune-bottom-bar">
	<!-- Adjustment tabs -->
	<div class="adjustment-tabs">
		{#each adjustments as adjustment (adjustment.id)}
			<button
				class="adjustment-tab"
				class:active={activeAdjustment === adjustment.id}
				onclick={() => handleTabClick(adjustment.id)}
				title={adjustment.label}
				aria-label={adjustment.label}
			>
				<iconify-icon icon={adjustment.icon} width="18"></iconify-icon>
				<span class="tab-label">{adjustment.label}</span>
			</button>
		{/each}
	</div>
</div>

<style>
@import "tailwindcss";
	.finetune-bottom-bar {
		@apply flex flex-col items-center;
		@apply px-4 py-3;
		background-color: rgb(var(--color-surface-100) / 1);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .finetune-bottom-bar {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.adjustment-tabs {
		@apply flex gap-1 overflow-x-auto;
		@apply max-w-full;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.adjustment-tabs::-webkit-scrollbar {
		display: none;
	}

	.adjustment-tab {
		@apply flex flex-col items-center gap-1;
		@apply rounded-lg px-3 py-2;
		@apply transition-all duration-200;
		@apply min-w-0 flex-shrink-0;
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-600) / 1);
	}

	:global(.dark) .adjustment-tab {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-300) / 1);
	}

	.adjustment-tab:hover {
		background-color: rgb(var(--color-surface-300) / 1);
		transform: translateY(-1px);
	}

	:global(.dark) .adjustment-tab:hover {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.adjustment-tab.active {
		background-color: rgb(var(--color-primary-500) / 1);
		color: white;
		box-shadow: 0 2px 8px rgba(var(--color-primary-500) / 0.3);
	}

	.tab-label {
		@apply whitespace-nowrap text-xs font-medium;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.adjustment-tab {
			@apply px-2 py-1.5;
		}

		.tab-label {
			@apply text-xs;
		}

		.adjustment-tab svg {
			width: 16px;
			height: 16px;
		}
	}

	@media (max-width: 640px) {
		.adjustment-tabs {
			@apply gap-0.5;
		}

		.adjustment-tab {
			@apply px-1.5 py-1;
		}

		.tab-label {
			font-size: 10px;
		}

		.adjustment-tab svg {
			width: 14px;
			height: 14px;
		}
	}
</style>
