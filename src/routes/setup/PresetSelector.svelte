<!--
@file src/routes/setup/PresetSelector.svelte
@component
Horizontal snap-scroll preset carousel for selecting project blueprints.
Default value is 'blank'.
-->
<script lang="ts">
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import type { Preset } from './presets';

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
		scrollEl?.scrollBy({ left: dir * 340, behavior: 'smooth' });
	}

	function select(id: string | null) {
		selected = id;
	}

	const complexityColor: Record<string, string> = {
		simple: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
		moderate: 'text-amber-400  border-amber-500/40  bg-amber-500/10',
		advanced: 'text-rose-400   border-rose-500/40   bg-rose-500/10'
	};
	const complexityLabel: Record<string, string> = {
		simple: 'Simple',
		moderate: 'Moderate',
		advanced: 'Advanced'
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
				class="scroll-btn {canScrollLeft ? '' : 'disabled'}"
				onclick={() => scrollBy(-1)}
				aria-label="Scroll left"
				disabled={!canScrollLeft}
			>
				<iconify-icon icon="mdi:chevron-left" width="20"></iconify-icon>
			</button>
			<button
				type="button"
				class="scroll-btn {canScrollRight ? '' : 'disabled'}"
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
		<!-- Left fade -->
		<div class="fade-left {canScrollLeft ? 'visible' : ''}"></div>

		<div class="scroll-track" bind:this={scrollEl} onscroll={updateScrollState} role="listbox" aria-label="Select a solution preset">
			<!-- ── Preset cards ── -->
			{#each presets as preset (preset.id)}
				<button
					type="button"
					role="option"
					aria-selected={selected === preset.id}
					class="preset-card {selected === preset.id ? 'active' : ''}"
					onclick={() => select(preset.id)}
				>
					<!-- Badge -->
					{#if preset.badge}
						<span class="badge-pill">{preset.badge}</span>
					{/if}

					<div class="card-row1">
						<div class="card-icon-wrap">
							<iconify-icon icon={preset.icon} width="24"></iconify-icon>
						</div>
						<div class="card-title-wrap">
							<span class="card-title">{preset.title}</span>
							{#if preset.complexity}
								<span class="complexity-chip {complexityColor[preset.complexity]}">
									{complexityLabel[preset.complexity]}
								</span>
							{/if}
						</div>
					</div>

					<div class="card-body">
						<span class="card-desc">{preset.description}</span>
					</div>

					<div class="card-footer">
						{#each preset.features.slice(0, 2) as f}
							<span class="feature-chip">{f}</span>
						{/each}
						{#if preset.features.length > 2}
							<span class="feature-chip overflow-chip">+{preset.features.length - 2}</span>
						{/if}
					</div>

					{#if selected === preset.id}
						<iconify-icon icon="mdi:check-circle" width="18" class="check-icon"></iconify-icon>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Right fade -->
		<div class="fade-right {canScrollRight ? 'visible' : ''}"></div>
	</div>

	<!-- Dot indicators -->
	<div class="dot-row" aria-hidden="true">
		{#each presets as preset, i (preset.id)}
			<button
				type="button"
				class="dot {selected === preset.id ? 'active' : ''}"
				onclick={() => {
					select(preset.id);
					scrollEl?.scrollTo({ left: i * 340, behavior: 'smooth' });
				}}
			></button>
		{/each}
	</div>

	<p class="helper-text">
		{selected
			? `Blueprint "${presets.find((p) => p.id === selected)?.title ?? selected}" selected — collections will be added automatically after setup.`
			: "No blueprint selected — you'll configure everything manually."}
	</p>
</section>

<style>
	/* ── Layout ── */
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
		gap: 8px;
	}
	.section-title {
		font-size: 1.05rem;
		font-weight: 600;
		color: white;
		margin: 0;
	}
	.icon-accent {
		color: var(--color-tertiary-500, #6ee7b7);
	}

	/* ── Scroll controls ── */
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
		transition: all 0.18s ease;
	}
	.scroll-btn:hover:not(.disabled) {
		background: rgba(255, 255, 255, 0.12);
		color: white;
		border-color: rgba(255, 255, 255, 0.25);
	}
	.scroll-btn.disabled {
		opacity: 0.25;
		cursor: default;
	}

	/* ── Track ── */
	.track-wrapper {
		position: relative;
	}

	.scroll-track {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		padding: 6px 4px 12px;
		scrollbar-width: none;
	}
	.scroll-track::-webkit-scrollbar {
		display: none;
	}

	/* Fade overlays */
	.fade-left,
	.fade-right {
		position: absolute;
		top: 0;
		bottom: 12px;
		width: 48px;
		pointer-events: none;
		z-index: 2;
		opacity: 0;
		transition: opacity 0.25s;
	}
	.fade-left {
		left: 0;
		background: linear-gradient(to right, #0d0f12 30%, transparent);
	}
	.fade-right {
		right: 0;
		background: linear-gradient(to left, #0d0f12 30%, transparent);
	}
	.fade-left.visible,
	.fade-right.visible {
		opacity: 1;
	}

	/* ── Preset card ── */
	.preset-card {
		position: relative;
		flex: 0 0 280px;
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		border-radius: 12px;
		border: 1.5px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.035);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.2s,
			background 0.2s,
			transform 0.15s,
			box-shadow 0.2s;
	}
	.preset-card:hover {
		border-color: rgba(110, 231, 183, 0.35);
		background: rgba(110, 231, 183, 0.04);
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
	}
	.preset-card.active {
		border-color: rgba(110, 231, 183, 0.7);
		background: rgba(110, 231, 183, 0.07);
		box-shadow:
			0 0 0 3px rgba(110, 231, 183, 0.12),
			0 8px 24px rgba(0, 0, 0, 0.3);
	}

	/* ── Card internals ── */
	.card-row1 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.card-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: rgba(110, 231, 183, 0.1);
		color: var(--color-tertiary-500, #6ee7b7);
		flex-shrink: 0;
	}

	.card-title-wrap {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}
	.card-title {
		font-size: 0.88rem;
		font-weight: 700;
		color: white;
		line-height: 1.2;
	}
	.card-desc {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.42);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-footer {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: auto;
		padding-top: 4px;
	}
	.feature-chip {
		font-size: 0.62rem;
		padding: 2px 8px;
		border-radius: 20px;
		background: rgba(255, 255, 255, 0.07);
		color: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	.overflow-chip {
		background: rgba(255, 255, 255, 0.04);
	}

	.complexity-chip {
		font-size: 0.58rem;
		padding: 2px 7px;
		border-radius: 20px;
		border: 1px solid;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
		top: 10px;
		right: 10px;
		color: var(--color-tertiary-500, #6ee7b7);
	}
	/* When badge is present, shift check icon left */
	.preset-card:has(.badge-pill) .check-icon {
		right: auto;
		left: 10px;
		top: 10px;
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

	/* ── Helper text ── */
	.helper-text {
		font-size: 0.71rem;
		color: rgba(255, 255, 255, 0.3);
		text-align: center;
		font-style: italic;
		margin-top: 4px;
	}
</style>
