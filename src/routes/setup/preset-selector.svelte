<!--
@file src/routes/setup/PresetSelector.svelte
@component
Horizontal snap-scroll preset carousel for selecting project blueprints.
Default value is 'blank'.
-->
<script lang="ts">
	import type { Preset } from './presets';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';

	let { presets, selected = $bindable('blank') } = $props<{
		presets: Preset[];
		selected: string | null;
	}>();

	let scrollEl = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(true);

	// Mouse Drag Scroll State
	let isDragging = $state(false);
	let startX = $state(0);
	let scrollLeft = $state(0);
	let dragMoved = $state(false); // Used to differentiate between click and drag

	function updateScrollState() {
		if (!scrollEl) {
			return;
		}
		canScrollLeft = scrollEl.scrollLeft > 8;
		canScrollRight = scrollEl.scrollLeft < scrollEl.scrollWidth - scrollEl.clientWidth - 8;
	}

	function handleMouseDown(e: MouseEvent) {
		if (!scrollEl) return;
		isDragging = true;
		startX = e.pageX - scrollEl.offsetLeft;
		scrollLeft = scrollEl.scrollLeft;
		dragMoved = false;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !scrollEl) return;
		e.preventDefault();
		const x = e.pageX - scrollEl.offsetLeft;
		const walk = (x - startX) * 1.5; // Scroll speed multiplier
		if (Math.abs(walk) > 5) dragMoved = true;
		scrollEl.scrollLeft = scrollLeft - walk;
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function scrollBy(dir: -1 | 1) {
		scrollEl?.scrollBy({ left: dir * 300, behavior: 'smooth' });
	}

	function select(id: string | null) {
		// Prevent selection if we were just dragging
		if (dragMoved) return;
		selected = id;
	}
</script>

<section class="preset-section">
	<div class="section-header">
		<div class="header-left">
			<iconify-icon icon="mdi:package-variant-closed" width="22" class="icon-accent"></iconify-icon>
			<h3 class="section-title">Project Blueprint</h3>
			<SystemTooltip title="Select a starting template for your CMS. This will pre-configure collections, roles, and settings.">
				<button type="button" class="text-slate-400 hover:text-tertiary-500" aria-label="Help: Project Blueprint">
					<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
				</button>
			</SystemTooltip>
		</div>

		<div class="scroll-controls">
			<button
				type="button"
				class="scroll-btn"
				class:disabled={!canScrollLeft}
				onclick={() => scrollBy(-1)}
				aria-label="Scroll left"
				disabled={!canScrollLeft}
			>
				<iconify-icon icon="mdi:chevron-left" width="20"></iconify-icon>
			</button>
			<button
				type="button"
				class="scroll-btn"
				class:disabled={!canScrollRight}
				onclick={() => scrollBy(1)}
				aria-label="Scroll right"
				disabled={!canScrollRight}
			>
				<iconify-icon icon="mdi:chevron-right" width="20"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Scroll track -->
	<div class="track-wrapper">
		<div class="fade-edge left" class:show={canScrollLeft}></div>
		<div
			class="scroll-track"
			bind:this={scrollEl}
			onscroll={updateScrollState}
			onmousedown={handleMouseDown}
			onmousemove={handleMouseMove}
			onmouseup={handleMouseUp}
			onmouseleave={handleMouseUp}
			class:grabbing={isDragging}
			role="listbox"
			tabindex="0"
			aria-label="Select a project blueprint"
		>
			<!-- ── Preset cards ── -->
			{#each presets as preset (preset.id)}
				<button
					type="button"
					role="option"
					aria-selected={selected === preset.id}
					class="preset-card"
					class:active={selected === preset.id}
					onclick={() => select(preset.id)}
				>
					<!-- Badge -->
					{#if preset.badge}
						<span class="badge-pill">{preset.badge}</span>
					{/if}

					<div class="card-row1">
						<div class="card-icon"><iconify-icon icon={preset.icon} width="22"></iconify-icon></div>
						<span class="card-title">{preset.title}</span>
						{#if preset.complexity}
							<span class="complexity {preset.complexity}"> {preset.complexity} </span>
						{/if}
					</div>

					<div class="card-desc">{preset.description}</div>

					<div class="card-tags">
						{#each preset.features.slice(0, 2) as f}
							<span class="chip">{f}</span>
						{/each}
						{#if preset.features.length > 2}
							<span class="chip more">+{preset.features.length - 2}</span>
						{/if}
					</div>

					{#if selected === preset.id}
						<iconify-icon icon="mdi:check-circle" width="18" class="check-icon"></iconify-icon>
					{/if}
				</button>
			{/each}
		</div>
		<div class="fade-edge right" class:show={canScrollRight}></div>
	</div>

	<!-- Dot indicators -->
	<div class="dot-row" aria-hidden="true">
		{#each presets as preset, i (preset.id)}
			<button
				type="button"
				class="dot"
				class:active={selected === preset.id}
				aria-label={`Select preset ${preset.name || i + 1}`}
				onclick={() => {
					select(preset.id);
					scrollEl?.scrollTo({ left: i * 268, behavior: 'smooth' });
				}}
			></button>
		{/each}
	</div>

	<p class="helper-text">
		{#if selected === 'blank'}
			"Blank Project" selected — start with a clean slate. No collections will be added automatically.
		{:else if selected}
			"{presets.find((p: Preset) => p.id === selected)?.title ?? selected}" selected — collections added automatically after setup.
		{:else}
			No preset — configure collections manually after setup.
		{/if}
	</p>
</section>

<style>
	.preset-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 100%;
		overflow-x: hidden;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.header-left {
		display: flex;
		gap: 9px;
		align-items: center;
	}
	.icon-accent {
		color: #10b981; /* Default emerald-500 */
	}
	:global(.dark) .icon-accent {
		color: #6ee7b7; /* emerald-300 */
	}
	.section-title {
		font-size: 1.05rem;
		font-weight: 600;
		color: inherit;
	}

	.scroll-controls {
		display: flex;
		gap: 6px;
	}
	.scroll-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		color: rgba(100, 116, 139, 0.7); /* slate-500 */
		cursor: pointer;
		background: rgba(0, 0, 0, 0.03);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 50%;
		transition: all 0.18s;
	}
	:global(.dark) .scroll-btn {
		color: rgba(255, 255, 255, 0.7);
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.12);
	}
	.scroll-btn:hover:not(:disabled) {
		color: #10b981;
		background: rgba(16, 185, 129, 0.08);
		border-color: rgba(16, 185, 129, 0.3);
	}
	:global(.dark) .scroll-btn:hover:not(:disabled) {
		color: white;
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.25);
	}
	.scroll-btn.disabled {
		cursor: default;
		opacity: 0.22;
	}

	.track-wrapper {
		position: relative;
		min-width: 0;
	}
	.scroll-track {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		padding: 6px 4px 14px;
		scrollbar-width: none;
		width: 100%;
		cursor: grab;
		user-select: none;
		transition: scroll-snap-type 0.3s;
	}
	.scroll-track.grabbing {
		cursor: grabbing;
		scroll-snap-type: none;
		scroll-behavior: auto;
	}
	.scroll-track::-webkit-scrollbar {
		display: none;
	}

	.fade-edge {
		position: absolute;
		top: 0;
		bottom: 14px;
		z-index: 2;
		width: 56px;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.25s;
	}
	.fade-edge.left {
		left: 0;
		background: linear-gradient(to right, white 30%, transparent);
	}
	:global(.dark) .fade-edge.left {
		background: linear-gradient(to right, #0d0f12 30%, transparent);
	}
	.fade-edge.right {
		right: 0;
		background: linear-gradient(to left, white 30%, transparent);
	}
	:global(.dark) .fade-edge.right {
		background: linear-gradient(to left, #0d0f12 30%, transparent);
	}
	.fade-edge.show {
		opacity: 1;
	}

	/* ── Card ── */
	.preset-card {
		position: relative;
		display: flex;
		flex: 0 0 256px;
		flex-direction: column;
		gap: 0;
		padding: 16px;
		overflow: hidden;
		text-align: left;
		cursor: pointer;
		scroll-snap-align: start;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		transition:
			border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			background 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}
	:global(.dark) .preset-card {
		background: rgba(255, 255, 255, 0.02);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border-color: rgba(255, 255, 255, 0.06);
		box-shadow: none;
	}
	.preset-card:hover {
		background: rgba(16, 185, 129, 0.02);
		border-color: rgba(16, 185, 129, 0.3);
		box-shadow: 0 10px 20px -10px rgba(0, 0, 0, 0.05);
		transform: translateY(-4px);
	}
	:global(.dark) .preset-card:hover {
		background: rgba(110, 231, 183, 0.05);
		border-color: rgba(110, 231, 183, 0.3);
		box-shadow:
			0 10px 30px -10px rgba(0, 0, 0, 0.5),
			inset 0 0 20px rgba(110, 231, 183, 0.05);
	}
	.preset-card.active {
		background: rgba(16, 185, 129, 0.05);
		border-color: #10b981;
		box-shadow:
			0 0 0 2px rgba(16, 185, 129, 0.1),
			0 10px 25px -12px rgba(16, 185, 129, 0.2);
		transform: translateY(-4px);
	}
	:global(.dark) .preset-card.active {
		background: rgba(110, 231, 183, 0.08);
		border-color: #6ee7b7;
		box-shadow:
			0 0 0 2px rgba(110, 231, 183, 0.2),
			0 15px 35px -12px rgba(0, 0, 0, 0.6),
			inset 0 0 15px rgba(110, 231, 183, 0.1);
	}

	/* ── Row 1: icon + title + complexity ── */
	.card-row1 {
		display: flex;
		gap: 10px;
		align-items: center;
		margin-bottom: 10px;
	}
	.card-icon {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		color: #10b981;
		background: rgba(16, 185, 129, 0.08);
		border-radius: 8px;
	}
	:global(.dark) .card-icon {
		color: #6ee7b7;
		background: rgba(110, 231, 183, 0.1);
	}
	.card-title {
		flex: 1;
		font-size: 0.88rem;
		font-weight: 700;
		line-height: 1.2;
		color: inherit;
	}
	.complexity {
		flex-shrink: 0;
		padding: 2px 7px;
		font-size: 0.58rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border: 1px solid;
		border-radius: 20px;
	}
	.complexity.simple {
		color: #059669;
		background: rgba(5, 150, 105, 0.08);
		border-color: rgba(5, 150, 105, 0.3);
	}
	:global(.dark) .complexity.simple {
		color: #34d399;
		background: rgba(52, 211, 153, 0.1);
		border-color: rgba(52, 211, 153, 0.4);
	}
	.complexity.moderate {
		color: #d97706;
		background: rgba(217, 119, 6, 0.08);
		border-color: rgba(217, 119, 6, 0.3);
	}
	:global(.dark) .complexity.moderate {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.1);
		border-color: rgba(251, 191, 36, 0.4);
	}
	.complexity.advanced {
		color: #dc2626;
		background: rgba(220, 38, 38, 0.08);
		border-color: rgba(220, 38, 38, 0.3);
	}
	:global(.dark) .complexity.advanced {
		color: #f87171;
		background: rgba(248, 113, 113, 0.1);
		border-color: rgba(248, 113, 113, 0.4);
	}

	/* ── Row 2: description ── */
	.card-desc {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		margin-bottom: 10px;
		overflow: hidden;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		font-size: 0.7rem;
		line-height: 1.5;
		color: rgba(0, 0, 0, 0.6);
	}
	:global(.dark) .card-desc {
		color: rgba(255, 255, 255, 0.42);
	}

	/* ── Row 3: tags ── */
	.card-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: auto;
	}
	.chip {
		padding: 2px 8px;
		font-size: 0.62rem;
		color: rgba(0, 0, 0, 0.5);
		background: rgba(0, 0, 0, 0.05);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 20px;
	}
	:global(.dark) .chip {
		color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.07);
		border-color: rgba(255, 255, 255, 0.1);
	}
	.chip.more {
		background: rgba(0, 0, 0, 0.03);
	}
	:global(.dark) .chip.more {
		background: rgba(255, 255, 255, 0.04);
	}

	/* Badge (Popular / New) */
	.badge-pill {
		position: absolute;
		top: 10px;
		right: 10px;
		padding: 2px 8px;
		font-size: 0.57rem;
		font-weight: 700;
		color: #d97706;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		background: rgba(217, 119, 6, 0.08);
		border: 1px solid rgba(217, 119, 6, 0.25);
		border-radius: 20px;
	}
	:global(.dark) .badge-pill {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
		border-color: rgba(251, 191, 36, 0.35);
	}

	/* Check icon */
	.check-icon {
		position: absolute;
		right: 10px;
		bottom: 10px;
		color: #10b981;
	}
	:global(.dark) .check-icon {
		color: #6ee7b7;
	}

	/* ── Dots ── */
	.dot-row {
		display: flex;
		gap: 5px;
		justify-content: center;
		padding: 2px 0;
	}
	.dot {
		width: 6px;
		height: 6px;
		padding: 0;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.15);
		border: none;
		border-radius: 50%;
		transition:
			background 0.2s,
			width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			border-radius 0.25s;
	}
	:global(.dark) .dot {
		background: rgba(255, 255, 255, 0.18);
	}
	.dot.active {
		width: 18px;
		background: #10b981;
		border-radius: 3px;
	}
	:global(.dark) .dot.active {
		background: #6ee7b7;
	}

	.helper-text {
		margin-top: 4px;
		font-size: 0.71rem;
		font-style: italic;
		color: rgba(0, 0, 0, 0.4);
		text-align: center;
	}
	:global(.dark) .helper-text {
		color: rgba(255, 255, 255, 0.3);
	}
</style>
