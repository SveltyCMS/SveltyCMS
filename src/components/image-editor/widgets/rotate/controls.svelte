<!--
@file: src/components/image-editor/widgets/rotate/controls.svelte
@component
Pintura-style rotate dock — compact glass pills, inline accent slider, single aligned row.
-->
<script lang="ts">
	let {
			rotationAngle,
			isFlippedH = false,
			isFlippedV = false,
			showGrid = false,
			snapToAngles = true,
			onRotateLeft,
			onRotateRight,
			onRotationChange,
			onFlipHorizontal,
			onFlipVertical,
			onStraighten,
			onAutoStraighten,
			onGridToggle,
			onSnapToggle
		}: {
			rotationAngle: number;
			isFlippedH?: boolean;
			isFlippedV?: boolean;
			showGrid?: boolean;
			snapToAngles?: boolean;
			onRotateLeft: () => void;
			onRotateRight: () => void;
			onRotationChange: (angle: number) => void;
			onFlipHorizontal: () => void;
			onFlipVertical: () => void;
			onStraighten?: () => void;
			onAutoStraighten?: () => void;
			onGridToggle?: () => void;
			onSnapToggle?: () => void;
		} = $props();

	const presetAngles = [-90, 0, 90, 180];

	const displayAngle = $derived.by(() => {
		let angle = rotationAngle % 360;
		if (angle > 180) angle -= 360;
		if (angle < -180) angle += 360;
		return Math.round(angle * 10) / 10;
	});

	const sliderProgress = $derived((rotationAngle + 180) / 360);

	const sliderFillStyle = $derived.by(() => {
		const center = 50;
		const thumb = sliderProgress * 100;
		const accent = 'var(--editor-accent, #f5c518)';
		const track = 'rgba(255, 255, 255, 0.16)';

		if (Math.abs(displayAngle) < 0.05) {
			return `linear-gradient(to right, ${track} 0%, ${track} 100%)`;
		}

		if (displayAngle > 0) {
			return `linear-gradient(to right, ${track} 0%, ${track} ${center}%, ${accent} ${center}%, ${accent} ${thumb}%, ${track} ${thumb}%, ${track} 100%)`;
		}

		return `linear-gradient(to right, ${track} 0%, ${track} ${thumb}%, ${accent} ${thumb}%, ${accent} ${center}%, ${track} ${center}%, ${track} 100%)`;
	});

	function handleAngleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onRotationChange(Number.parseFloat(target.value));
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') return;

		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				if (e.shiftKey) onRotationChange(rotationAngle - 0.1);
				else if (cmdOrCtrl) onRotateLeft();
				else onRotationChange(rotationAngle - 1);
				break;
			case 'ArrowRight':
				e.preventDefault();
				if (e.shiftKey) onRotationChange(rotationAngle + 0.1);
				else if (cmdOrCtrl) onRotateRight();
				else onRotationChange(rotationAngle + 1);
				break;
			case 'h':
			case 'H':
				e.preventDefault();
				onFlipHorizontal();
				break;
			case 'v':
			case 'V':
				e.preventDefault();
				onFlipVertical();
				break;
			case 'g':
			case 'G':
				if (onGridToggle) {
					e.preventDefault();
					onGridToggle();
				}
				break;
			case 's':
			case 'S':
				if (onStraighten && !cmdOrCtrl) {
					e.preventDefault();
					onStraighten();
				}
				break;
			case '0':
				e.preventDefault();
				onRotationChange(0);
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-col flex-[0_0_auto] gap-1 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Rotate controls">
	<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full gap-1.5 items-center justify-center w-full px-0.5 max-lg:justify-start" role="group" aria-label="Rotate and flip">
		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full">
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center justify-center h-7 w-7 px-0 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onRotateLeft} title="Rotate left 90°" aria-label="Rotate left 90°">
				<iconify-icon icon="mdi:rotate-left" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center justify-center h-7 w-7 px-0 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onRotateRight} title="Rotate right 90°" aria-label="Rotate right 90°">
				<iconify-icon icon="mdi:rotate-right" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center justify-center h-7 w-7 px-0 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				class:text-white={isFlippedH}
				onclick={onFlipHorizontal}
				title="Flip horizontal (H)"
				aria-label="Flip horizontal"
				aria-pressed={isFlippedH}
			>
				<iconify-icon icon="mdi:flip-horizontal" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center justify-center h-7 w-7 px-0 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				class:text-white={isFlippedV}
				onclick={onFlipVertical}
				title="Flip vertical (V)"
				aria-label="Flip vertical"
				aria-pressed={isFlippedV}
			>
				<iconify-icon icon="mdi:flip-vertical" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full" role="group" aria-label="Rotation presets">
			{#each presetAngles as angle (angle)}
				<button
					type="button"
					class="inline-flex flex-[0_0_auto] gap-1.5 items-center px-[0.4375rem] text-[10px] tabular-nums h-7 font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
					class:text-white={Math.abs(displayAngle - angle) < 0.5}
					onclick={() => onRotationChange(angle)}
					aria-label="Rotate to {angle} degrees"
				>
					{angle > 0 ? '+' : ''}{angle}°
				</button>
			{/each}
		</div>

		{#if onGridToggle}
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center px-[0.4375rem] text-[10px] tabular-nums h-7 font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				class:text-white={showGrid}
				onclick={onGridToggle}
				title="Toggle grid (G)"
				aria-label="Toggle grid"
				aria-pressed={showGrid}
			>
				<iconify-icon icon="mdi:grid" width="15" aria-hidden="true"></iconify-icon>
			</button>
		{/if}

		{#if onSnapToggle}
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center px-[0.4375rem] text-[10px] tabular-nums h-7 font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				class:text-white={snapToAngles}
				onclick={onSnapToggle}
				title="Snap to angles"
				aria-label="Snap to angles"
				aria-pressed={snapToAngles}
			>
				<iconify-icon icon="mdi:magnet" width="15" aria-hidden="true"></iconify-icon>
			</button>
		{/if}

		{#if onStraighten}
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center px-[0.4375rem] text-[10px] tabular-nums h-7 font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onStraighten} title="Straighten (S)" aria-label="Straighten">
				<iconify-icon icon="mdi:image-filter-center-focus-weak" width="15" aria-hidden="true"></iconify-icon>
			</button>
		{/if}

		{#if onAutoStraighten}
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center px-[0.4375rem] text-[10px] tabular-nums h-7 font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onAutoStraighten} title="Auto-straighten" aria-label="Auto-straighten">
				<iconify-icon icon="mdi:auto-fix" width="15" aria-hidden="true"></iconify-icon>
			</button>
		{/if}

		<div class="flex flex-[1_1_7rem] items-center justify-center min-w-24 max-w-56 mx-0.5 max-lg:basis-full max-lg:order-4 max-lg:max-w-none max-lg:mx-0">
			<div class="relative w-full">
				<div class="absolute top-1/2 left-1/2 z-1 w-[1.5px] h-2.5 pointer-events-none bg-white/45 rounded-[1px] -translate-x-1/2 -translate-y-1/2" aria-hidden="true"></div>
				<input aria-label="Rotation angle"
					id="rotate-slider"
					type="range"
					min="-180"
					max="180"
					step={snapToAngles ? '15' : '0.1'}
					value={rotationAngle}
					oninput={handleAngleInput}
					class="relative z-2 w-full flex-1 h-1 m-0 appearance-none cursor-pointer bg-white/[0.18] rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:bg-[--editor-accent-hover,var(--color-warning-400,#ffd43b)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:[box-shadow:0_0_0_1px_rgba(0,0,0,0.2)] [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:bg-[--editor-accent-hover,var(--color-warning-400,#ffd43b)] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[rgba(0,0,0,0.15)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:[box-shadow:0_0_0_1px_rgba(0,0,0,0.2)]"
					style:background={sliderFillStyle}
					aria-valuemin={-180}
					aria-valuemax={180}
					aria-valuenow={rotationAngle}
				/>
			</div>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center justify-center h-auto min-h-0 p-0.5 px-2 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full shrink-0 max-lg:order-5">
			<span class="min-w-[2.25rem] text-[11px] font-medium tabular-nums leading-7 text-[rgba(255,255,255,0.92)] text-center" aria-live="polite">{displayAngle}°</span>
		</div>
	</div>
</div>
