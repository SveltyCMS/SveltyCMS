<!--
@file src/routes/(app)/dashboard/widgets/calendar-view/index.svelte
@component
**Calendar View dashboard widget — monthly calendar of scheduled events.**

### Features:
- month navigation (prev / next)
- event dots for scheduled items (release, meeting, …)
- today highlight
- client-side only (static category — no API dependency)

### Marketplace metadata
- `widgetMeta` export feeds the dashboard widget registry and the
  marketplace catalog (id, name, icon, description, defaultSize).
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: "Calendar View",
		icon: "mdi:calendar-month-outline",
		description: "Interactive monthly calendar widget for tracking scheduled events and content milestones.",
		defaultSize: { w: 2, h: 2 },
	};
</script>

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { formatDate } from '@utils/format-date';

	let selectedDate = $state(new Date());
	let events = $state<{ dateStr: string; title: string; type: string }[]>([
		{ dateStr: new Date().toISOString().split('T')[0], title: 'Product Launch Release', type: 'release' },
		{ dateStr: new Date(Date.now() + 86400000).toISOString().split('T')[0], title: 'Team Sync Meeting', type: 'meeting' }
	]);

	const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function getDaysInMonth(year: number, month: number) {
		return new Date(year, month + 1, 0).getDate();
	}

	let currentYear = $derived(selectedDate.getFullYear());
	let currentMonth = $derived(selectedDate.getMonth());
	let monthName = $derived(formatDate(selectedDate, { month: 'long' }));
	let daysInMonth = $derived(getDaysInMonth(currentYear, currentMonth));
	let firstDayIndex = $derived(new Date(currentYear, currentMonth, 1).getDay());

	function prevMonth() {
		selectedDate = new Date(currentYear, currentMonth - 1, 1);
	}

	function nextMonth() {
		selectedDate = new Date(currentYear, currentMonth + 1, 1);
	}
</script>

<div class="card p-5 bg-white dark:bg-surface-800 border border-surface-500/30 dark:border-surface-500/40 rounded-2xl shadow-sm space-y-4">
	<div class="flex items-center justify-between border-b border-surface-100 dark:border-surface-500/40 pb-3">
		<div class="flex items-center gap-2">
			<iconify-icon icon="mdi:calendar-month-outline" width="20" class="text-warning-500"></iconify-icon>
			<h3 class="font-bold text-sm text-surface-900 dark:text-white">Admin Calendar View</h3>
		</div>
		<div class="flex items-center gap-1">
			<Button type="button" variant="ghost" size="sm" onclick={prevMonth} aria-label="Previous month">
				<iconify-icon icon="mdi:chevron-left" width="18"></iconify-icon>
			</Button>
			<span class="text-xs font-bold text-surface-900 dark:text-white px-1">{monthName} {currentYear}</span>
			<Button type="button" variant="ghost" size="sm" onclick={nextMonth} aria-label="Next month">
				<iconify-icon icon="mdi:chevron-right" width="18"></iconify-icon>
			</Button>
		</div>
	</div>

	<!-- Calendar Grid -->
	<div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-surface-400">
		{#each daysOfWeek as day (day)}
			<div class="py-1">{day}</div>
		{/each}

		{#each Array(firstDayIndex) as _, i (i)}
			<div class="h-7"></div>
		{/each}

		{#each Array(daysInMonth) as _, i (i)}
			{@const dayNum = i + 1}
			{@const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`}
			{@const hasEvent = events.some((e) => e.dateStr === dateStr)}
			{@const isToday = new Date().toISOString().split('T')[0] === dateStr}
			<div class="h-7 flex items-center justify-center rounded-lg text-xs font-semibold relative transition-all {isToday ? 'bg-primary-500 text-white shadow-md' : 'text-surface-700 dark:text-surface-300 hover:bg-surface-500/10 dark:hover:bg-surface-700'}">
				{dayNum}
				{#if hasEvent && !isToday}
					<span class="absolute bottom-1 w-1 h-1 bg-warning-500 rounded-full"></span>
				{/if}
			</div>
		{/each}
	</div>
</div>
