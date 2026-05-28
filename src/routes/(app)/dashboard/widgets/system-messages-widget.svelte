<!--
@file src/routes/(app)/dashboard/widgets/SystemMessagesWidget.svelte
@component
**Modern System Messages Widget — Notifications with severity indicators and adaptive layouts**

### Props
- `label` (string): Widget label (default: 'System Messages')
- `size` (WidgetSize): Controls layout — h:1 compact chips, h:2+ rich cards

### Features:
- Adaptive dual layout: compact (h:1) colored chips, rich (h:2+) expandable cards
- Severity-colored accents (critical=red, high=orange, medium=amber, low/info=blue)
- Distinct icons per severity level
- Clickable messages expand inline to show full body text
- Auto-detects and renders links inside message bodies
- Timestamp formatting with relative dates
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "System Messages",
	icon: "mdi:message-alert-outline",
	description: "Important system notifications with severity indicators",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface SysMessage {
		id?: string;
		title: string;
		message?: string;
		body?: string;
		level?: string;
		type?: string;
		timestamp: string;
		link?: string;
	}

	const {
		label = 'System Messages',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:message-alert-outline',
		widgetId = undefined as string | undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);
	let expandedId = $state<string | null>(null);

	function toggleExpand(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	function msgText(m: SysMessage): string {
		return m.message || m.body || m.title || '';
	}

	function severityLevel(m: SysMessage): string {
		return m.level?.toLowerCase() || m.type?.toLowerCase() || 'info';
	}

	function severityCls(m: SysMessage): string {
		const lvl = severityLevel(m);
		if (lvl === 'critical' || lvl === 'error') return 'border-s-red-500 bg-red-50/50 dark:bg-red-950/20';
		if (lvl === 'high' || lvl === 'warning') return 'border-s-orange-500 bg-orange-50/50 dark:bg-orange-950/20';
		if (lvl === 'medium' || lvl === 'warn') return 'border-s-amber-500 bg-amber-50/50 dark:bg-amber-950/20';
		return 'border-s-blue-500 bg-blue-50/50 dark:bg-blue-950/20';
	}

	function severityDot(m: SysMessage): string {
		const lvl = severityLevel(m);
		if (lvl === 'critical' || lvl === 'error') return 'bg-red-500';
		if (lvl === 'high' || lvl === 'warning') return 'bg-orange-500';
		if (lvl === 'medium' || lvl === 'warn') return 'bg-amber-500';
		return 'bg-blue-500';
	}

	function severityIcon(m: SysMessage): string {
		const lvl = severityLevel(m);
		if (lvl === 'critical' || lvl === 'error') return 'mdi:alert-octagon';
		if (lvl === 'high' || lvl === 'warning') return 'mdi:alert';
		if (lvl === 'medium' || lvl === 'warn') return 'mdi:information-outline';
		return 'mdi:check-circle-outline';
	}

	function severityLabel(m: SysMessage): string {
		const lvl = severityLevel(m);
		if (lvl === 'critical') return 'Critical';
		if (lvl === 'error') return 'Error';
		if (lvl === 'high' || lvl === 'warning') return 'Warning';
		if (lvl === 'medium' || lvl === 'warn') return 'Notice';
		return 'Info';
	}

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'Just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
		return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}

	function hasLink(text: string): boolean {
		return /https?:\/\/[^\s]+/.test(text);
	}

	function extractLinks(text: string): Array<{ url: string; text: string }> {
		const matches = text.match(/https?:\/\/[^\s]+/g);
		return matches ? matches.map((url) => ({ url, text: url.length > 50 ? url.slice(0, 47) + '...' : url })) : [];
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/system-messages"
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{@const messages = (Array.isArray(data) ? data : []) as SysMessage[]}

		{#if messages.length === 0}
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:chat-sleep" class="text-4xl opacity-20 mb-3" ></iconify-icon>
				<div class="text-sm font-medium text-surface-500">No system messages</div>
				<div class="text-xs text-surface-400 mt-1">Everything is running smoothly</div>
			</div>
		{:else if isCompact}
			<div class="flex h-full items-center gap-2 overflow-hidden">
				<span class="shrink-0 text-xs font-semibold text-surface-500">{messages.length} msgs</span>
				<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>
				<div class="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
					{#each messages.slice(0, 8) as msg (msg.id || msg.timestamp + msg.title)}
						<div class="flex shrink-0 items-center gap-1 rounded-full border-s-2 {severityCls(msg)} px-2 py-0.5" title="{severityLabel(msg)}: {msgText(msg)}">
							<div class="h-2 w-2 rounded-full {severityDot(msg)} shrink-0"></div>
							<span class="max-w-20 truncate text-[10px] font-medium text-surface-700 dark:text-surface-300">
								{msg.title}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col">
				<div class="flex-1 overflow-y-auto space-y-2 pe-0.5 custom-scroll">
					{#each messages.slice(0, 5) as msg (msg.id || msg.timestamp + msg.title)}
						{@const msgId = msg.id || msg.timestamp + msg.title}
						{@const isOpen = expandedId === msgId}
						<button
							onclick={() => toggleExpand(msgId)}
							class="w-full text-left rounded-2xl border-s-3 {severityCls(msg)} px-4 py-3 transition-colors hover:opacity-90"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-center gap-2 shrink-0">
									<iconify-icon icon={severityIcon(msg)} class="text-lg {severityDot(msg).replace('bg-', 'text-')}" ></iconify-icon>
									<span class="text-[10px] font-semibold uppercase tracking-wider {severityDot(msg).replace('bg-', 'text-')}">
										{severityLabel(msg)}
									</span>
								</div>
								<span class="shrink-0 text-[11px] tabular-nums text-surface-400 dark:text-surface-500">
									{fmtTime(msg.timestamp)}
								</span>
							</div>

							<div class="mt-2 font-semibold text-sm text-surface-900 dark:text-surface-100">
								{msg.title}
							</div>

							<p class="mt-1 text-sm leading-snug text-surface-600 dark:text-surface-300 {isOpen ? '' : 'line-clamp-2'}">
								{msgText(msg)}
							</p>

							{#if isOpen && hasLink(msgText(msg))}
								<div class="mt-2 space-y-1">
									{#each extractLinks(msgText(msg)) as link}
										<a
											href={link.url}
											target="_blank"
											rel="noopener noreferrer"
											class="block text-xs text-blue-500 hover:text-blue-600 underline truncate"
											onclick={(e: MouseEvent) => e.stopPropagation()}
										>
											{link.text}
										</a>
									{/each}
								</div>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	.scrollbar-none { scrollbar-width: none; }
	.scrollbar-none::-webkit-scrollbar { display: none; }
	.custom-scroll::-webkit-scrollbar { width: 4px; }
	.custom-scroll::-webkit-scrollbar-track { background: transparent; }
	.custom-scroll::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.25); border-radius: 9999px; }
	.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.45); }
</style>
