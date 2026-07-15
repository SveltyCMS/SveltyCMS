<!--
@file src/components/media/aspect-preview.svelte
@component
**Aspect Ratio Preview Grid with Focal Point Overlay**

Shows how an image crops to different aspect ratios (16:9, 1:1, 4:3, etc.),
centered on a configurable focal point. Modeled after Payload CMS's
aspect-preview plugin and Drupal's focal point preview.

### Props
- `imageUrl` (string): Full URL of the source image
- `focalPoint` ({ x: number; y: number }): Focal point as 0–100 percentages
- `ratios` (AspectRatio[]): Which ratios to preview (defaults to common web ratios)
- `onFocalChange` (function): Callback when focal point changes (for interactive mode)
- `interactive` (boolean): Allow dragging focal point on previews
- `readonly` (boolean): Hide crosshair, show previews only

### Features:
- Pure CSS object-fit: cover + object-position — no canvas overhead
- Live focal point dragging updates all previews simultaneously
- Accessible: keyboard-navigable, ARIA-labeled preview cards
- Responsive grid: 2 cols mobile → 7 cols ultrawide
- Tailwind v4 styling with semantic color tokens
-->

<script lang="ts">
	/**
	 * Represents a single aspect ratio to preview.
	 */
	export interface AspectRatio {
		/** Display label (e.g. "16:9", "1:1") */
		label: string;
		/** Width component of the ratio */
		width: number;
		/** Height component of the ratio */
		height: number;
	}

	/** Common web aspect ratios used across content layouts. */
	const DEFAULT_RATIOS: AspectRatio[] = [
		{ label: '16:9', width: 16, height: 9 },
		{ label: '3:2', width: 3, height: 2 },
		{ label: '4:3', width: 4, height: 3 },
		{ label: '1:1', width: 1, height: 1 },
		{ label: '2:3', width: 2, height: 3 },
		{ label: '9:16', width: 9, height: 16 },
		{ label: '21:9', width: 21, height: 9 },
	];

	let {
		imageUrl = '',
		focalPoint = $bindable({ x: 50, y: 50 }) as { x: number; y: number },
		ratios = DEFAULT_RATIOS,
		onFocalChange = (_fp: { x: number; y: number }) => {},
		interactive = false,
		readonly = false,
	}: {
		imageUrl: string;
		focalPoint?: { x: number; y: number };
		ratios?: AspectRatio[];
		onFocalChange?: (fp: { x: number; y: number }) => void;
		interactive?: boolean;
		readonly?: boolean;
	} = $props();

	let dragging = $state(false);

	/** Compute focal point from a pointer event relative to a container element. */
	function computeFromEvent(e: PointerEvent, container: HTMLElement) {
		const rect = container.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
			y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
		};
	}

	function handlePointerDown(e: PointerEvent) {
		if (!interactive) return;
		const container = e.currentTarget as HTMLElement;
		dragging = true;
		container.setPointerCapture(e.pointerId);
		focalPoint = computeFromEvent(e, container);
		onFocalChange(focalPoint);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging || !interactive) return;
		const container = e.currentTarget as HTMLElement;
		focalPoint = computeFromEvent(e, container);
		onFocalChange(focalPoint);
	}

	function handlePointerUp(_e: PointerEvent) {
		dragging = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!interactive) return;
		const step = e.shiftKey ? 10 : 1;
		let changed = false;
		let nx = focalPoint.x;
		let ny = focalPoint.y;
		switch (e.key) {
			case 'ArrowLeft':  nx = Math.max(0, nx - step); changed = true; break;
			case 'ArrowRight': nx = Math.min(100, nx + step); changed = true; break;
			case 'ArrowUp':    ny = Math.max(0, ny - step); changed = true; break;
			case 'ArrowDown':  ny = Math.min(100, ny + step); changed = true; break;
		}
		if (changed) {
			e.preventDefault();
			focalPoint = { x: nx, y: ny };
			onFocalChange(focalPoint);
		}
	}

	function ratioKey(ratio: AspectRatio): string {
		return `${ratio.width}-${ratio.height}`;
	}
</script>

{#if imageUrl}
	<div
		class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7"
		role="list"
		aria-label="Aspect ratio previews"
	>
		{#each ratios as ratio (ratioKey(ratio))}
			<div
				class="flex flex-col overflow-hidden rounded-lg border border-surface-200 bg-surface-50 shadow-sm transition-shadow hover:shadow-md dark:border-surface-700 dark:bg-surface-800"
				role="listitem"
			>
				<!-- Preview container -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="relative w-full overflow-hidden rounded-t-lg bg-surface-200 dark:bg-surface-900"
					class:cursor-crosshair={interactive}
					style="aspect-ratio: {ratio.width} / {ratio.height};"
					onpointerdown={handlePointerDown}
					onpointermove={handlePointerMove}
					onpointerup={handlePointerUp}
					role={interactive ? 'slider' : 'img'}
					aria-label="{ratio.label} aspect ratio preview"
					aria-valuemin={interactive ? 0 : undefined}
					aria-valuemax={interactive ? 100 : undefined}
					aria-valuenow={interactive ? Math.round(focalPoint.x) : undefined}
					aria-valuetext={interactive ? `Focal point at ${Math.round(focalPoint.x)}%, ${Math.round(focalPoint.y)}%` : undefined}
					tabindex={interactive ? 0 : undefined}
					onkeydown={handleKeyDown}
				>
					<img
						src={imageUrl}
						alt="{ratio.label} crop preview"
						class="absolute inset-0 h-full w-full select-none"
						style="object-fit: cover; object-position: {focalPoint.x}% {focalPoint.y}%;"
						draggable="false"
						crossorigin="anonymous"
					/>

					<!-- Rule of thirds overlay (subtle) -->
					<div class="pointer-events-none absolute inset-0">
						<div class="absolute top-1/3 inset-s-0 inset-e-0 h-px bg-white/15"></div>
						<div class="absolute top-2/3 inset-s-0 inset-e-0 h-px bg-white/15"></div>
						<div class="absolute inset-s-1/3 top-0 bottom-0 w-px bg-white/15"></div>
						<div class="absolute inset-s-2/3 top-0 bottom-0 w-px bg-white/15"></div>
					</div>

					<!-- Focal point crosshair -->
					{#if !readonly}
						<div
							class="pointer-events-none absolute z-10 transition-all duration-75"
							style="left: {focalPoint.x}%; top: {focalPoint.y}%; transform: translate(-50%, -50%);"
						>
							<div class="h-2.5 w-2.5 rounded-full border-2 border-white bg-primary-500/60 shadow-[0_0_6px_rgba(0,0,0,0.5)]"></div>
						</div>
					{/if}
				</div>

				<!-- Ratio label -->
				<div class="px-2 py-1.5 text-center text-xs font-semibold text-surface-600 dark:text-surface-300">
					{ratio.label}
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div class="flex items-center justify-center rounded-lg border-2 border-dashed border-surface-300 p-8 dark:border-surface-600">
		<p class="text-sm text-surface-500 dark:text-surface-400">No image to preview</p>
	</div>
{/if}
