<!--
@file src/routes/setup/PresetSelector.svelte
@component
Horizontal snap-scroll preset carousel for selecting project blueprints.
Default value is 'blank'.
-->
<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import type { Preset } from './presets';

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

	// Update active index based on scroll position for dots
	let visibleIndex = $state(0);

	// Setup intersection observer when the component mounts
	$effect(() => {
		if (!scrollEl) return;

		const observer = new IntersectionObserver(
			(entries) => {
				// Find the fully/mostly visible entry
				entries.forEach((entry) => {
					if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
						// Figure out the index of this element
						const target = entry.target as HTMLElement;
						const index = Array.from(scrollEl?.children || []).indexOf(target);
						if (index !== -1) {
							visibleIndex = index;
						}
					}
				});
			},
			{
				root: scrollEl,
				threshold: 0.5 // Trigger when a card is at least 50% visible
			}
		);

		// Observe all preset cards
		Array.from(scrollEl.children).forEach((child) => observer.observe(child));

		return () => {
			observer.disconnect();
		};
	});
</script>

<section class="flex flex-col gap-3 overflow-hidden w-full">
	<div class="flex items-center justify-between mb-1">
		<div class="flex gap-2.5 items-center">
			<iconify-icon icon="mdi:package-variant-closed" width="22" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			<h3 class="text-[1.05rem] font-semibold text-dark dark:text-white">Project Blueprint</h3>
			<SystemTooltip title="Select a starting template for your CMS. This will pre-configure collections, roles, and settings.">
				<button type="button" class="text-slate-400 hover:text-tertiary-500" aria-label="Help: Project Blueprint">
					<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
				</button>
			</SystemTooltip>
		</div>

		<div class="flex gap-1.5">
			<button
				type="button"
				class="btn-icon preset-filled rounded-full disabled:hidden"
				onclick={() => scrollBy(-1)}
				aria-label="Scroll left"
				disabled={!canScrollLeft}
			>
				<iconify-icon icon="mdi:chevron-left" width="20"></iconify-icon>
			</button>
			<button
				type="button"
				class="btn-icon preset-filled rounded-full disabled:hidden"
				onclick={() => scrollBy(1)}
				aria-label="Scroll right"
				disabled={!canScrollRight}
			>
				<iconify-icon icon="mdi:chevron-right" width="20"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Scroll track -->
	<div class="relative min-w-0">
		<div
			class="absolute top-0 bottom-[14px] z-2 w-14 pointer-events-none opacity-0 transition-opacity duration-250 left-0 bg-linear-to-r from-white dark:from-[#0d0f12] via-white/30 dark:via-[#0d0f12]/30 to-transparent {canScrollLeft
				? 'opacity-100'
				: ''}"
		></div>
		<div
			class="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1.5 pt-1.5 px-1 w-full cursor-grab select-none transition-[scroll-snap-type] duration-300 [&::-webkit-scrollbar]:hidden {isDragging
				? 'cursor-grabbing! snap-none! scroll-auto!'
				: ''}"
			bind:this={scrollEl}
			onscroll={updateScrollState}
			onmousedown={handleMouseDown}
			onmousemove={handleMouseMove}
			onmouseup={handleMouseUp}
			onmouseleave={handleMouseUp}
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
					class="relative flex flex-col flex-none w-64 p-4 overflow-hidden text-left cursor-pointer snap-start bg-white dark:bg-white/5 dark:backdrop-blur-md border border-black/10 dark:border-white/10 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none transition-all duration-250 hover:bg-primary-500/5 dark:hover:bg-primary-300/5 hover:border-primary-500/30 dark:hover:border-primary-300/30 hover:shadow-[0_10px_20px_-10px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5),inset_0_0_20px_rgba(110,231,183,0.05)] hover:-translate-y-1 {selected ===
					preset.id
						? 'bg-primary-500/5! dark:bg-primary-300/10! border-primary-500! dark:border-primary-300! shadow-[0_0_0_2px_rgba(16,185,129,0.1),0_10px_25px_-12px_rgba(16,185,129,0.2)]! dark:shadow-[0_0_0_2px_rgba(110,231,183,0.2),0_15px_35px_-12px_rgba(0,0,0,0.6),inset_0_0_15px_rgba(110,231,183,0.1)]! -translate-y-1!'
						: ''}"
					onclick={() => select(preset.id)}
				>
					<div class="  mt-2 flex items-center gap-2">
						<iconify-icon icon={preset.icon} width="22" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span class="flex-1 text-black dark:text-white font-bold text-[0.88rem] leading-[1.2]">{preset.title}</span>

						{#if preset.complexity}
							<div
								class="absolute top-1 right-1 shrink-0 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wider border rounded-full {preset.complexity ===
								'simple'
									? 'text-primary-600 dark:text-primary-400 bg-primary-600/10 dark:bg-primary-400/10 border-primary-600/30 dark:border-primary-400/40'
									: preset.complexity === 'moderate'
										? 'text-warning-600 dark:text-warning-400 bg-warning-600/10 dark:bg-warning-400/10 border-warning-600/30 dark:border-warning-400/40'
										: 'text-error-600 dark:text-error-400 bg-error-600/10 dark:bg-error-400/10 border-error-600/30 dark:border-error-400/40'}"
							>
								{preset.complexity}
							</div>
						{/if}
					</div>

					<div class="line-clamp-3 text-xs leading-relaxed text-black/60 dark:text-white/40">{preset.description}</div>

					<div class="flex flex-wrap gap-1 mt-auto">
						{#each preset.features.slice(0, 2) as f}
							<span
								class="px-2 py-0.5 text-[0.62rem] text-black dark:text-white bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-full"
								>{f}</span
							>
						{/each}
						{#if preset.features.length > 2}
							<span
								class="px-2 py-0.5 text-[0.62rem] text-black dark:text-white bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full"
								>+{preset.features.length - 2}</span
							>
						{/if}
					</div>

					{#if selected === preset.id}
						<iconify-icon icon="mdi:check-circle" width="24" class="absolute right-1 bottom-2 text-primary-500"></iconify-icon>
					{/if}
				</button>
			{/each}
		</div>
		<div
			class="absolute top-0 bottom-[14px] z-2 w-14 pointer-events-none opacity-0 transition-opacity duration-250 right-0 bg-linear-to-l from-white dark:from-[#0d0f12] via-white/30 dark:via-[#0d0f12]/30 to-transparent {canScrollRight
				? 'opacity-100'
				: ''}"
		></div>
	</div>

	<!-- Dot indicators -->
	<div class="flex gap-1.5 justify-center py-0.5" aria-hidden="true">
		{#each presets as preset, i (preset.id)}
			<button
				type="button"
				class="w-1.5 h-1.5 p-0 cursor-pointer border-none rounded-full transition-all duration-250 bg-black/15 dark:bg-white/20 {visibleIndex === i
					? 'w-[18px]! rounded-[3px]! bg-primary-500! dark:bg-primary-300!'
					: ''}"
				aria-label={`Select preset ${preset.name || i + 1}`}
				onclick={() => {
					select(preset.id);
					scrollEl?.scrollTo({ left: i * 268, behavior: 'smooth' });
				}}
			></button>
		{/each}
	</div>

	<p class="mb-1 text-[0.71rem] italic text-center text-black dark:text-white">
		{#if selected === 'blank'}
			"Blank Project" selected — start with a clean slate. No collections will be added automatically.
		{:else if selected}
			"{presets.find((p: Preset) => p.id === selected)?.title ?? selected}" selected — collections added automatically after setup.
		{:else}
			No preset — configure collections manually after setup.
		{/if}
	</p>
</section>
