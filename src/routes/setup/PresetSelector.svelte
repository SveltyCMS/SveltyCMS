<!--
@file src/routes/setup/PresetSelector.svelte
@component
Horizontal snap-scroll preset carousel for selecting project blueprints.
Default value is 'blank'.
-->
<script lang="ts">
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import type { Preset } from './presets';
	import * as m from '@src/paraglide/messages';

	let { presets, selected = $bindable('blank') } = $props<{
		presets: Preset[];
		selected: string | null;
	}>();

	let scrollEl = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(true);

	function updateScrollState() {
		if (!scrollEl) return;
		canScrollLeft = scrollEl.scrollLeft > 8;
		canScrollRight = scrollEl.scrollLeft < scrollEl.scrollWidth - scrollEl.clientWidth - 8;
	}

	function scrollBy(dir: -1 | 1) {
		scrollEl?.scrollBy({ left: dir * 300, behavior: 'smooth' });
	}

	function select(id: string | null) {
		selected = id;
	}

	const complexityColor: Record<string, string> = {
		simple: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
		moderate: 'text-amber-400  border-amber-500/40  bg-amber-500/10',
		advanced: 'text-rose-400   border-rose-500/40   bg-rose-500/10'
	};
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
		<div class="scroll-track" bind:this={scrollEl} onscroll={updateScrollState} role="listbox" aria-label="Select a project blueprint">
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
						<div class="card-icon">
							<iconify-icon icon={preset.icon} width="22"></iconify-icon>
						</div>
						<span class="card-title">{preset.title}</span>
						{#if preset.complexity}
							<span class="complexity {preset.complexity}">
								{preset.complexity}
							</span>
						{/if}
					</div>

					<div class="card-desc">
						{preset.description}
					</div>

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
				onclick={() => {
					select(preset.id);
					scrollEl?.scrollTo({ left: i * 268, behavior: 'smooth' });
				}}
			></button>
		{/each}
	</div>

	<p class="helper-text">
		{selected
			? `"${presets.find((p) => p.id === selected)?.title ?? selected}" selected — collections added automatically after setup.`
			: "No preset — configure collections manually after setup."}
	</p>
</section>

<style>
	.preset-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.header-left {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.icon-accent {
		color: #6ee7b7;
	}
	.section-title {
		font-size: 1.05rem;
		font-weight: 600;
		color: white;
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
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.18s;
	}
	.scroll-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		color: white;
		border-color: rgba(255, 255, 255, 0.25);
	}
	.scroll-btn.disabled {
		opacity: 0.22;
		cursor: default;
	}

	.track-wrapper {
		position: relative;
	}
	.scroll-track {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		padding: 6px 4px 14px;
		scrollbar-width: none;
	}
	.scroll-track::-webkit-scrollbar {
		display: none;
	}

	.fade-edge {
		position: absolute;
		top: 0;
		bottom: 14px;
		width: 56px;
		pointer-events: none;
		z-index: 2;
		opacity: 0;
		transition: opacity 0.25s;
	}
	.fade-edge.left {
		left: 0;
		background: linear-gradient(to right, #0d0f12 30%, transparent);
	}
	.fade-edge.right {
		right: 0;
		background: linear-gradient(to left, #0d0f12 30%, transparent);
	}
	.fade-edge.show {
		opacity: 1;
	}

	/* ── Card ── */
	.preset-card {
		position: relative;
		flex: 0 0 256px;
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 16px;
		border-radius: 12px;
		border: 1.5px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.2s,
			background 0.2s,
			transform 0.15s,
			box-shadow 0.2s;
		overflow: hidden;
	}
	.preset-card:hover {
		border-color: rgba(110, 231, 183, 0.3);
		background: rgba(110, 231, 183, 0.04);
		transform: translateY(-2px);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
	}
	.preset-card.active {
		border-color: rgba(110, 231, 183, 0.75);
		background: rgba(110, 231, 183, 0.07);
		box-shadow:
			0 0 0 3px rgba(110, 231, 183, 0.12),
			0 10px 32px rgba(0, 0, 0, 0.35);
		transform: translateY(-2px);
	}

	/* ── Row 1: icon + title + complexity ── */
	.card-row1 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}
	.card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		flex-shrink: 0;
		background: rgba(110, 231, 183, 0.1);
		color: #6ee7b7;
	}
	.card-title {
		font-size: 0.88rem;
		font-weight: 700;
		color: white;
		flex: 1;
		line-height: 1.2;
	}
	.complexity {
		font-size: 0.58rem;
		padding: 2px 7px;
		border-radius: 20px;
		font-weight: 700;
		letter-spacing: 0.04em;
		border: 1px solid;
		flex-shrink: 0;
		text-transform: uppercase;
	}
	.complexity.simple {
		color: #34d399;
		border-color: rgba(52, 211, 153, 0.4);
		background: rgba(52, 211, 153, 0.1);
	}
	.complexity.moderate {
		color: #fbbf24;
		border-color: rgba(251, 191, 36, 0.4);
		background: rgba(251, 191, 36, 0.1);
	}
	.complexity.advanced {
		color: #f87171;
		border-color: rgba(248, 113, 113, 0.4);
		background: rgba(248, 113, 113, 0.1);
	}

	/* ── Row 2: description ── */
	.card-desc {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.42);
		line-height: 1.5;
		margin-bottom: 10px;
		/* clamp to ~3 lines */
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* ── Row 3: tags ── */
	.card-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: auto;
	}
	.chip {
		font-size: 0.62rem;
		padding: 2px 8px;
		border-radius: 20px;
		background: rgba(255, 255, 255, 0.07);
		color: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	.chip.more {
		background: rgba(255, 255, 255, 0.04);
	}

	/* Badge (Popular / New) */
	.badge-pill {
		position: absolute;
		top: 10px;
		right: 10px;
		font-size: 0.57rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 8px;
		border-radius: 20px;
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
		border: 1px solid rgba(251, 191, 36, 0.35);
	}

	/* Check icon */
	.check-icon {
		position: absolute;
		bottom: 10px;
		right: 10px;
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
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.18);
		border: none;
		cursor: pointer;
		padding: 0;
		transition:
			background 0.2s,
			width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			border-radius 0.25s;
	}
	.dot.active {
		width: 18px;
		border-radius: 3px;
		background: #6ee7b7;
	}

	.helper-text {
		font-size: 0.71rem;
		color: rgba(255, 255, 255, 0.3);
		text-align: center;
		font-style: italic;
		margin-top: 4px;
	}
</style>
