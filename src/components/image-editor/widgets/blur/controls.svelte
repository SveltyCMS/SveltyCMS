<!--
@file: src/components/image-editor/widgets/blur/controls.svelte
@component
Pintura-style blur bottom dock — glass pills, aligned slider, no solid CMS buttons.
-->
<script lang="ts">
	let {
			blurStrength,
			hasActiveRegion = false,
			regionCount = 0,
			onStrengthChange,
			onAddRegion,
			onDeleteRegion,
			onReset,
			onCancel,
			onApply
		}: {
			blurStrength: number;
			hasActiveRegion?: boolean;
			regionCount?: number;
			onStrengthChange: (value: number) => void;
			onAddRegion: () => void;
			onDeleteRegion: () => void;
			onReset: () => void;
			onCancel: () => void;
			onApply: () => void;
		} = $props();

	const sliderProgress = $derived(Math.max(0, Math.min(1, (blurStrength - 5) / 95)));

	function handleStrengthInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onStrengthChange(Number.parseInt(target.value, 10));
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.target && (e.target as HTMLElement).tagName === 'INPUT') {
			return;
		}

		if ((e.key === 'Delete' || e.key === 'Backspace') && hasActiveRegion) {
			e.preventDefault();
			onDeleteRegion();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-col flex-[0_0_auto] gap-1 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Blur controls">
	<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full gap-2 items-center justify-center w-full px-0.5 max-lg:justify-start" role="group" aria-label="Blur regions">
		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full">
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onAddRegion} title="Add blur region" aria-label="Add blur region">
				<iconify-icon icon="mdi:plus" width="15" aria-hidden="true"></iconify-icon>
				<span>Add region</span>
			</button>
		</div>

		{#if regionCount > 0}
			<span class="text-[9px] font-semibold text-[rgba(255,255,255,0.45)]" aria-live="polite">
				{regionCount} {regionCount === 1 ? 'region' : 'regions'}
			</span>
		{/if}

		<div class="flex flex-[1_1_7rem] items-center justify-center min-w-24 max-w-56 mx-0.5 max-lg:basis-full max-lg:order-3 max-lg:max-w-none max-lg:mx-0">
			<div class="w-full">
				<input aria-label="Blur amount"
					id="blur-strength-slider"
					type="range"
					min="5"
					max="100"
					step="1"
					value={blurStrength}
					oninput={handleStrengthInput}
					class="flex-1 h-1 m-0 appearance-none cursor-pointer rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:bg-[--editor-accent-hover,var(--color-warning-400,#ffd43b)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:[box-shadow:0_0_0_1px_rgba(0,0,0,0.2)] [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:bg-[--editor-accent-hover,var(--color-warning-400,#ffd43b)] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[rgba(0,0,0,0.15)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:[box-shadow:0_0_0_1px_rgba(0,0,0,0.2)]"
					style:background="linear-gradient(to right, var(--editor-accent, #f5c518) 0%, var(--editor-accent, #f5c518) {sliderProgress * 100}%, rgba(255, 255, 255, 0.16) {sliderProgress * 100}%, rgba(255, 255, 255, 0.16) 100%)"
					aria-valuemin={5}
					aria-valuemax={100}
					aria-valuenow={blurStrength}
				/>
			</div>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full shrink-0" role="group" aria-label="Blur actions">
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				onclick={onReset}
				disabled={regionCount === 0}
				title="Reset all regions"
				aria-label="Reset all blur regions"
			>
				<iconify-icon icon="mdi:restore" width="15" aria-hidden="true"></iconify-icon>
				<span>Reset</span>
			</button>
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] hover:not-disabled:text-[#fecaca] hover:not-disabled:bg-[rgba(239,68,68,0.12)] hover:not-disabled:border-[rgba(239,68,68,0.22)] disabled:cursor-not-allowed disabled:opacity-35"
				onclick={onDeleteRegion}
				disabled={!hasActiveRegion}
				title="Delete selected region"
				aria-label="Delete selected blur region"
			>
				<iconify-icon icon="mdi:delete-outline" width="15" aria-hidden="true"></iconify-icon>
				<span>Delete</span>
			</button>
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onCancel} title="Cancel blur" aria-label="Cancel blur">
				<iconify-icon icon="mdi:close" width="15" aria-hidden="true"></iconify-icon>
				<span>Cancel</span>
			</button>
		</div>

		<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium whitespace-nowrap cursor-pointer rounded-full transition-[background,color,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-35 text-[rgba(255,255,255,0.92)] bg-white/8 border-white/[0.14] hover:not-disabled:text-[#141414] hover:not-disabled:bg-[--editor-accent] hover:not-disabled:border-transparent shrink-0" onclick={onApply} title="Apply blur" aria-label="Apply blur">
			<iconify-icon icon="mdi:check" width="15" aria-hidden="true"></iconify-icon>
			<span>Apply</span>
		</button>
	</div>
</div>
