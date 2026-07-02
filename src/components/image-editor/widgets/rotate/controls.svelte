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

<div class="editor-dock rotate-dock" role="toolbar" aria-label="Rotate controls">
	<div class="dock-row dock-row-scroll rotate-dock-row">
		<div class="dock-pill-group" role="group" aria-label="Rotate and flip">
			<button type="button" class="dock-pill dock-pill-icon" onclick={onRotateLeft} title="Rotate left 90°" aria-label="Rotate left 90°">
				<iconify-icon icon="mdi:rotate-left" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button type="button" class="dock-pill dock-pill-icon" onclick={onRotateRight} title="Rotate right 90°" aria-label="Rotate right 90°">
				<iconify-icon icon="mdi:rotate-right" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button
				type="button"
				class="dock-pill dock-pill-icon"
				class:dock-pill-active={isFlippedH}
				onclick={onFlipHorizontal}
				title="Flip horizontal (H)"
				aria-label="Flip horizontal"
				aria-pressed={isFlippedH}
			>
				<iconify-icon icon="mdi:flip-horizontal" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button
				type="button"
				class="dock-pill dock-pill-icon"
				class:dock-pill-active={isFlippedV}
				onclick={onFlipVertical}
				title="Flip vertical (V)"
				aria-label="Flip vertical"
				aria-pressed={isFlippedV}
			>
				<iconify-icon icon="mdi:flip-vertical" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="dock-pill-group rotate-preset-group" role="group" aria-label="Rotation presets">
			{#each presetAngles as angle (angle)}
				<button
					type="button"
					class="dock-pill dock-pill-compact"
					class:dock-pill-active={Math.abs(displayAngle - angle) < 0.5}
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
				class="dock-pill dock-pill-compact"
				class:dock-pill-active={showGrid}
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
				class="dock-pill dock-pill-compact"
				class:dock-pill-active={snapToAngles}
				onclick={onSnapToggle}
				title="Snap to angles"
				aria-label="Snap to angles"
				aria-pressed={snapToAngles}
			>
				<iconify-icon icon="mdi:magnet" width="15" aria-hidden="true"></iconify-icon>
			</button>
		{/if}

		{#if onStraighten}
			<button type="button" class="dock-pill dock-pill-compact" onclick={onStraighten} title="Straighten (S)" aria-label="Straighten">
				<iconify-icon icon="mdi:image-filter-center-focus-weak" width="15" aria-hidden="true"></iconify-icon>
			</button>
		{/if}

		{#if onAutoStraighten}
			<button type="button" class="dock-pill dock-pill-compact" onclick={onAutoStraighten} title="Auto-straighten" aria-label="Auto-straighten">
				<iconify-icon icon="mdi:auto-fix" width="15" aria-hidden="true"></iconify-icon>
			</button>
		{/if}

		<div class="rotate-slider-wrap">
			<div class="slider-track rotate-slider-track">
				<div class="rotate-center-tick" aria-hidden="true"></div>
				<input aria-label="Rotation angle"
					id="rotate-slider"
					type="range"
					min="-180"
					max="180"
					step={snapToAngles ? '15' : '0.1'}
					value={rotationAngle}
					oninput={handleAngleInput}
					class="slider-input rotate-slider-input"
					style:background={sliderFillStyle}
					aria-label="Fine-tune rotation angle"
					aria-valuemin={-180}
					aria-valuemax={180}
					aria-valuenow={rotationAngle}
				/>
			</div>
		</div>

		<div class="dock-pill-group rotate-angle-group">
			<span class="rotate-angle-value" aria-live="polite">{displayAngle}°</span>
		</div>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.rotate-dock-row {
		gap: 0.375rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding-inline: 0.125rem;
	}

	.dock-pill-icon {
		justify-content: center;
		width: 1.75rem;
		padding-inline: 0;
	}

	.rotate-preset-group .dock-pill-compact {
		padding-inline: 0.4375rem;
		font-size: 0.625rem;
		font-variant-numeric: tabular-nums;
	}

	.rotate-slider-wrap {
		display: flex;
		flex: 1 1 7rem;
		align-items: center;
		justify-content: center;
		min-width: 6rem;
		max-width: 14rem;
		margin-inline: 0.125rem;
	}

	.rotate-slider-track {
		position: relative;
		width: 100%;
	}

	.rotate-center-tick {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 1;
		width: 1.5px;
		height: 0.625rem;
		pointer-events: none;
		background: rgba(255, 255, 255, 0.45);
		border-radius: 1px;
		transform: translate(-50%, -50%);
	}

	.rotate-slider-input {
		position: relative;
		z-index: 2;
		width: 100%;
	}

	.rotate-slider-input::-webkit-slider-thumb {
		background: var(--editor-accent-hover, #ffd43b);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.rotate-slider-input::-moz-range-thumb {
		background: var(--editor-accent-hover, #ffd43b);
		border-color: rgba(0, 0, 0, 0.15);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.rotate-angle-group {
		flex-shrink: 0;
		justify-content: center;
		padding-inline: 0.5rem;
	}

	.rotate-angle-value {
		min-width: 2.25rem;
		font-size: 0.6875rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1.75rem;
		color: var(--editor-chrome-text-hover, rgba(255, 255, 255, 0.92));
		text-align: center;
	}

	@media (max-width: 1024px) {
		.rotate-dock-row {
			justify-content: flex-start;
		}

		.rotate-slider-wrap {
			flex-basis: 100%;
			order: 4;
			max-width: none;
			margin-inline: 0;
		}

		.rotate-angle-group {
			order: 5;
		}
	}
</style>
