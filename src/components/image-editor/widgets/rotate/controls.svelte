<!--
@file: src/components/image-editor/widgets/rotate/controls.svelte
@component
Rotate bottom dock — pill actions + volume-style rotation slider with center tick.
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
	<div class="dock-row dock-row-scroll">
		<div class="dock-pill-group">
			<button type="button" class="dock-pill" onclick={onRotateLeft} title="Rotate left 90°" aria-label="Rotate left 90°">
				<iconify-icon icon="mdi:rotate-left" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button type="button" class="dock-pill" onclick={onRotateRight} title="Rotate right 90°" aria-label="Rotate right 90°">
				<iconify-icon icon="mdi:rotate-right" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="dock-pill-group">
			<button
				type="button"
				class="dock-pill"
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
				class="dock-pill"
				class:dock-pill-active={isFlippedV}
				onclick={onFlipVertical}
				title="Flip vertical (V)"
				aria-label="Flip vertical"
				aria-pressed={isFlippedV}
			>
				<iconify-icon icon="mdi:flip-vertical" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		{#if onGridToggle}
			<button
				type="button"
				class="dock-pill"
				class:dock-pill-active={showGrid}
				onclick={onGridToggle}
				title="Toggle grid (G)"
				aria-label="Toggle grid"
				aria-pressed={showGrid}
			>
				<iconify-icon icon="mdi:grid" width="15" aria-hidden="true"></iconify-icon>
				<span>Grid</span>
			</button>
		{/if}

		{#if onSnapToggle}
			<button
				type="button"
				class="dock-pill"
				class:dock-pill-active={snapToAngles}
				onclick={onSnapToggle}
				title="Snap to angles"
				aria-label="Snap to angles"
				aria-pressed={snapToAngles}
			>
				<iconify-icon icon="mdi:magnet" width="15" aria-hidden="true"></iconify-icon>
				<span>Snap</span>
			</button>
		{/if}

		{#if onStraighten}
			<button type="button" class="dock-pill" onclick={onStraighten} title="Straighten (S)" aria-label="Straighten">
				<iconify-icon icon="mdi:image-filter-center-focus-weak" width="15" aria-hidden="true"></iconify-icon>
				<span>Straighten</span>
			</button>
		{/if}

		{#if onAutoStraighten}
			<button type="button" class="dock-pill" onclick={onAutoStraighten} title="Auto-straighten" aria-label="Auto-straighten">
				<iconify-icon icon="mdi:auto-fix" width="15" aria-hidden="true"></iconify-icon>
				<span>Auto</span>
			</button>
		{/if}
	</div>

	<div class="dock-row dock-row-scroll">
		{#each presetAngles as angle (angle)}
			<button
				type="button"
				class="dock-pill"
				class:dock-pill-active={Math.abs(displayAngle - angle) < 0.5}
				onclick={() => onRotationChange(angle)}
				aria-label="Rotate to {angle} degrees"
			>
				{angle > 0 ? '+' : ''}{angle}°
			</button>
		{/each}
	</div>

	<div class="volume-slider-block">
		<span class="slider-label">rotation</span>
		<div class="volume-slider-shell">
			<div class="volume-slider-track">
				<div class="center-tick" aria-hidden="true"></div>
				<input
					id="rotate-slider"
					type="range"
					min="-180"
					max="180"
					step={snapToAngles ? '15' : '0.1'}
					value={rotationAngle}
					oninput={handleAngleInput}
					class="volume-slider"
					aria-label="Fine-tune rotation angle"
				/>
			</div>
			<div class="angle-display">{displayAngle}°</div>
		</div>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.rotate-dock {
		gap: 0.5rem;
	}

	.volume-slider-block {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;
		max-width: 40rem;
		margin-inline: auto;
	}

	.volume-slider-shell {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		width: 100%;
		min-width: 0;
		padding: 0.35rem 0.85rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 9999px;
	}

	.volume-slider-track {
		position: relative;
		display: flex;
		flex: 1;
		align-items: center;
		height: 1.5rem;
		padding-inline: 0.5rem;
	}

	.volume-slider {
		position: absolute;
		width: 100%;
		height: 6px;
		margin: 0;
		appearance: none;
		cursor: pointer;
		outline: none;
		background: rgba(255, 255, 255, 0.22);
		border-radius: 3px;
	}

	.volume-slider::-webkit-slider-thumb {
		width: 20px;
		height: 20px;
		margin-top: -7px;
		appearance: none;
		cursor: pointer;
		background: #fff;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: transform 0.1s ease;
	}

	.volume-slider::-webkit-slider-thumb:hover {
		box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.12);
		transform: scale(1.08);
	}

	.volume-slider::-webkit-slider-thumb:active {
		background: rgb(var(--color-primary-500) / 1);
		border-color: #fff;
	}

	.volume-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		cursor: pointer;
		background: #fff;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.center-tick {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 2px;
		height: 10px;
		pointer-events: none;
		background: rgba(255, 255, 255, 0.35);
		border-radius: 1px;
		transform: translate(-50%, -50%);
	}

	.angle-display {
		min-width: 3.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #fff;
		text-align: end;
	}
</style>
