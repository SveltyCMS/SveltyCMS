<!--
@file src/routes/(app)/dashboard/widgets/UserOnlineWidget.svelte
@component
**Dashboard widget for displaying online users with online time tracking**

@example
<UserOnlineWidget label="Online Users" />

### Props
- `label`: The label for the widget (default: 'Online Users')

Features:
- Display currently logged-in users
- Show online duration for each user
- Sorted by longest online time first
- Real-time avatar display with fallback placeholders
- Responsive layout with hover effects
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Online Users',
		icon: 'mdi:account-multiple-outline',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	interface OnlineUser {
		id: string;
		name: string;
		avatarUrl?: string;
		onlineTime: string;
		onlineMinutes: number;
	}

	type FetchedData = { onlineUsers: OnlineUser[] } | undefined;

	let searchTerm = $state('');

	const {
		label = 'Online Users',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:account-multiple-outline',
		widgetId = undefined,
		size = { w: 1, h: 1 },
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();

	function getPlaceholderAvatar(name: string) {
		const initials = name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.substring(0, 2)
			.toUpperCase();
		return `https://placehold.co/40x40/6366f1/e0e7ff?text=${initials}`;
	}

	function filterUsers(users: OnlineUser[], search: string): OnlineUser[] {
		if (!search.trim()) return users;
		const searchLower = search.toLowerCase();
		return users.filter((user) => user.name.toLowerCase().includes(searchLower));
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/online_user"
	pollInterval={60000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: fetchedData }: { data: FetchedData })}
		{#if fetchedData?.onlineUsers}
			{@const filteredUsers = filterUsers(fetchedData.onlineUsers, searchTerm)}
			<div class="flex h-full flex-col space-y-2">
				<!-- Header with count -->
				<div class="text-center text-sm">
					<span class="font-bold text-primary-500">{fetchedData.onlineUsers.length}</span>
					User(s) currently online.
				</div>

				<!-- Search input (always show if there are users) -->
				{#if fetchedData.onlineUsers.length > 0}
					<div class="relative">
						<input
							type="text"
							placeholder="Search users..."
							bind:value={searchTerm}
							class="w-full rounded-md border border-surface-300 bg-surface-50 px-3 py-1.5 text-xs placeholder-preset-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-200 dark:placeholder-preset-500"
						/>
						<iconify-icon icon="mdi:magnify" class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500" width="14"
						></iconify-icon>
					</div>
				{/if}

				<!-- User list -->
				<div class="grow space-y-1 overflow-y-auto" style="max-height: 180px;">
					{#if filteredUsers.length > 0}
						{#each filteredUsers as user (user.id)}
							<div class="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-surface-50 dark:hover:bg-surface-700">
								<div class="flex min-w-0 flex-1 items-center gap-2">
									<img
										src={user.avatarUrl || getPlaceholderAvatar(user.name)}
										alt="{user.name}'s avatar"
										class="h-7 w-7 shrink-0 rounded-full bg-surface-200 dark:bg-surface-700"
									/>
									<span class="truncate text-sm font-medium text-surface-800 dark:text-surface-200">{user.name}</span>
								</div>
								<span class="shrink-0 text-xs text-surface-500 dark:text-surface-400">
									{user.onlineTime || 'N/A'}
								</span>
							</div>
						{/each}
					{:else if searchTerm}
						<div class="flex h-full items-center justify-center text-sm text-surface-500">
							No users found matching "{searchTerm}".
						</div>
					{:else}
						<div class="flex h-full items-center justify-center text-sm text-surface-500">No users are currently active.</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-surface-500">Loading online users...</div>
		{/if}
	{/snippet}
</BaseWidget>
