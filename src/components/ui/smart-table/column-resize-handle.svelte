<!--
@file src/components/ui/smart-table/column-resize-handle.svelte
@component
**Drag handle for Smart Table column resize (pointer events).**

### Props
- `columnKey` (string): Column id.
- `onResize` (fn): Called with new width in px while dragging / on release.
- `minWidth` (number): Minimum width (default 48).
-->

<script lang="ts">
	let {
		columnKey,
		onResize,
		minWidth = 48
	}: {
		columnKey: string;
		onResize: (key: string, widthPx: number) => void;
		minWidth?: number;
	} = $props();

	let startX = 0;
	let startW = 0;
	let dragging = $state(false);

	function onPointerDown(e: PointerEvent) {
		const th = (e.currentTarget as HTMLElement).closest('th');
		if (!th) return;
		e.preventDefault();
		e.stopPropagation();
		dragging = true;
		startX = e.clientX;
		startW = th.getBoundingClientRect().width;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const next = Math.max(minWidth, startW + (e.clientX - startX));
		onResize(columnKey, next);
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}
	}
</script>

<span
	role="separator"
	aria-orientation="vertical"
	aria-label="Resize column {columnKey}"
	tabindex="0"
	class="absolute inset-e-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-tertiary-500/40 dark:hover:bg-primary-500/40 {dragging
		? 'bg-tertiary-500/50 dark:bg-primary-500/50'
		: ''}"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
></span>
