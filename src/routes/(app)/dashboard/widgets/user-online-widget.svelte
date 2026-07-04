<!--
@file src/routes/(app)/dashboard/widgets/UserOnlineWidget.svelte
@component
**Online Users widget with real-time presence, role indicators, and compact/rich layouts**

### Props
- `label` (string): Widget label (default: 'Online Users')
- `size` (WidgetSize): Widget dimensions; `h:1` renders a compact horizontal layout

### Features:
- Adaptive layout: compact (h:1) horizontal chip scroll vs. rich (h:2+) card list
- Role badge indicators (admin/editor/viewer) with color coding
- Live green presence dot on user avatars
- Search filtering (only when >3 users in rich layout)
- Gravatars for users with emails, initials fallback
- Keyboard-navigable user list with ARIA compliance
- Modern card-style rows with hover micro-animations
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Online Users",
	icon: "mdi:account-multiple-outline",
	description: "Currently active users with role indicators",
	defaultSize: { w: 1, h: 2 },
};

	let licenseStatus = $state<{ active?: boolean; hasLicense?: boolean; daysRemaining?: number | null } | null>(null);

	$effect(() => {
		fetch('/api/system/license-status?type=dashboard&id=user-online')
			.then((res) => res.json())
			.then((data) => {
				licenseStatus = data;
			})
			.catch(() => {
				licenseStatus = { active: false, hasLicense: false, daysRemaining: 0 };
			});
	});
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface OnlineUser {
		id: string;
		name: string;
		email: string;
		role: string;
		avatarUrl?: string | null;
		onlineMinutes: number;
		onlineTime: string;
	}

	const {
		label = 'Online Users',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:account-multiple-outline',
		widgetId = undefined as string | undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	let searchTerm = $state('');

	const isCompact = $derived(size.h === 1);

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	function getAvatarUrl(user: OnlineUser): string {
		if (user.avatarUrl) return user.avatarUrl;
		if (user.email) {
			const hash = btoa(user.email.trim().toLowerCase()).slice(0, 16);
			return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`;
		}
		return `https://placehold.co/40x40/6366f1/ffffff?text=${getInitials(user.name)}`;
	}

	function getRoleLabel(role: string): string {
		switch (role) {
			case 'admin': return 'Admin';
			case 'editor': return 'Editor';
			case 'viewer': return 'Viewer';
			default: return role.charAt(0).toUpperCase() + role.slice(1);
		}
	}

	function getRoleColor(role: string): string {
		switch (role) {
			case 'admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
			case 'editor': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
			case 'viewer': return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
			default: return 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400';
		}
	}

	function formatOnlineTime(minutes: number): string {
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m`;
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
</script>

{#if licenseStatus && !licenseStatus.active && !licenseStatus.hasLicense}
	<BaseWidget
		{label}
		{theme}
		{icon}
		{widgetId}
		{size}
		{onSizeChange}
		onCloseRequest={onRemove}
	>
		<div class="flex h-full flex-col items-center justify-center text-center px-4 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
			<iconify-icon icon="mdi:lock-outline" class="text-4xl text-amber-500 mb-2"></iconify-icon>
			<h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Premium Extension</h3>
			<p class="text-xs text-surface-500 mt-1 mb-3">Your 14-day trial for this extension has expired. A valid LICENSE_KEY is required.</p>
			<a href="https://marketplace.sveltycms.com" target="_blank" class="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">Upgrade License &rarr;</a>
		</div>
	</BaseWidget>
{:else}
<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/online-user"
	pollInterval={45000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const onlineUsers = (data?.onlineUsers || []) as OnlineUser[]}
		{const totalOnline = onlineUsers.length}
		{const filteredUsers = searchTerm.trim()
			? onlineUsers.filter((u: OnlineUser) =>
				u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				u.email.toLowerCase().includes(searchTerm.toLowerCase())
			)
			: onlineUsers}

		{#if totalOnline === 0}
			<!-- ===== Empty State ===== -->
			<div class="flex h-full flex-col items-center justify-center text-center px-3">
				<div class="text-4xl opacity-30 mb-3">👥</div>
				<div class="text-sm font-medium text-surface-500 dark:text-surface-400">
					No users online
				</div>
				<div class="text-xs text-surface-400 dark:text-surface-500 mt-1">
					They'll appear here when active
				</div>
			</div>
		{:else if isCompact}
			<!-- ===== Compact Layout (h:1) ===== -->
			<div class="flex h-full items-center gap-3 overflow-hidden">
				<!-- Count badge -->
				<div class="flex shrink-0 items-center gap-1.5">
					<span class="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
						{totalOnline}
					</span>
					<span class="text-xs text-surface-500 dark:text-surface-400">online</span>
				</div>

				<!-- Divider -->
				<div class="h-6 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>

				<!-- Horizontal avatar scroll -->
				<div class="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
					{#each onlineUsers as user (user.id)}
						<div
							class="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-100 px-2 py-1 dark:bg-surface-800"
							title="{user.name} — {getRoleLabel(user.role)} · {formatOnlineTime(user.onlineMinutes)} online"
						>
							<div class="relative shrink-0">
								<img
									src={getAvatarUrl(user)}
									alt={user.name}
									class="h-6 w-6 rounded-full object-cover"
								/>
								<div class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-100 bg-emerald-500 dark:border-surface-800"></div>
							</div>
							<span class="max-w-20 truncate text-xs font-medium text-surface-700 dark:text-surface-300">
								{user.name}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<!-- ===== Rich Layout (h:2+) ===== -->
			<div class="flex h-full flex-col">

				<!-- Header -->
				<div class="flex items-center justify-between pb-3">
					<div class="flex items-baseline gap-1.5">
						<span class="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
							{totalOnline}
						</span>
						<span class="text-sm text-surface-500 dark:text-surface-400">online now</span>
					</div>

					{#if totalOnline > 1}
						<div class="rounded-full bg-surface-100 px-2.5 py-0.5 text-xs text-surface-600 dark:bg-surface-800 dark:text-surface-400">
							{totalOnline} active
						</div>
					{/if}
				</div>

				<!-- Search (only when >3 users) -->
				{#if totalOnline > 3}
					<div class="relative mb-3">
						<input aria-label="Search users"
							type="text"
							bind:value={searchTerm}
							placeholder="Filter users..."
							class="w-full rounded border border-surface-200 bg-surface-50 py-1.5 pe-9 ps-3 text-sm text-surface-800 placeholder-surface-400 transition-colors focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:placeholder-surface-500"
						/>
						<iconify-icon
							icon="mdi:magnify"
							width="16"
							class="absolute inset-e-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500"
						></iconify-icon>
					</div>
				{/if}

				<!-- User List -->
				<div class="flex-1 overflow-y-auto space-y-1 pe-0.5 custom-scroll" role="list" aria-label="Online users">
					{#each filteredUsers as user (user.id)}
						<div
							class="group flex items-center gap-3 rounded-2xl bg-surface-50 px-3 py-2.5 transition-colors hover:bg-surface-100 dark:bg-surface-800/60 dark:hover:bg-surface-700/60"
							role="listitem"
						>
							<!-- Avatar with presence dot -->
							<div class="relative shrink-0">
								<img
									src={getAvatarUrl(user)}
									alt={user.name}
									class="h-9 w-9 rounded-full object-cover ring-2 ring-white dark:ring-surface-800"
									loading="lazy"
								/>
								<div class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-surface-800"></div>
							</div>

							<!-- Name and role -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="truncate text-sm font-medium text-surface-900 dark:text-surface-100 group-hover:text-tertiary-600 dark:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
										{user.name}
									</span>
									<span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none {getRoleColor(user.role)}">
										{getRoleLabel(user.role)}
									</span>
								</div>
								<div class="mt-0.5 text-xs text-surface-500 dark:text-surface-400">
									{formatOnlineTime(user.onlineMinutes)} online
								</div>
							</div>

							<!-- Time -->
							<div class="shrink-0 text-end text-[11px] font-medium text-surface-400 dark:text-surface-500">
								{user.onlineTime
									? new Date(user.onlineTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
									: '—'}
							</div>
						</div>
					{/each}

					{#if filteredUsers.length === 0 && searchTerm}
						<div class="flex h-24 items-center justify-center text-sm text-surface-400 dark:text-surface-500">
							No users match "{searchTerm}"
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
{/if}

<style>
	.scrollbar-none {
		scrollbar-width: none;
	}
	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
	.custom-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scroll::-webkit-scrollbar-thumb {
		background: rgba(156, 163, 175, 0.25);
		border-radius: 9999px;
	}
	.custom-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(156, 163, 175, 0.45);
	}
</style>
