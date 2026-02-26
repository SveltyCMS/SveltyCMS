<!--
@file src/components/collaboration/activity-stream.svelte
@component
**Real-time Activity Stream and AI Assistant Panel**

Provides a tabbed interface for viewing system-wide events and interacting
with the AI collaboration assistant.
-->

<script lang="ts">
	import { collaboration } from '@src/stores/collaboration-store.svelte';
	import { screen } from '@src/stores/screen-size-store.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';

	let { ondrag } = $props();

	const totalUsers = $derived(page.data.totalUsers ?? 1);
	const chatLabel = $derived(totalUsers === 1 ? 'AI Assistant' : 'Chat');
	const aiEmptyText = $derived(
		totalUsers === 1
			? 'Ask me anything about your project'
			: collaboration.currentRoom
				? 'Start collaborating with others'
				: 'Ask me anything about your data'
	);

	let newMessage = $state('');
	let scrollContainer: HTMLDivElement | undefined = $state(undefined);

	// Auto-scroll to bottom of chat
	$effect(() => {
		if (collaboration.activeTab === 'chat' && collaboration.aiHistory.length) {
			tick().then(() => {
				if (scrollContainer) {
					scrollContainer.scrollTop = scrollContainer.scrollHeight;
				}
			});
		}
	});

	function handleSendMessage(event: Event) {
		event.preventDefault();
		if (!newMessage.trim()) {
			return;
		}
		collaboration.sendMessage(newMessage);
		newMessage = '';
	}

	function formatTimestamp(ts: string) {
		const date = new Date(ts);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function getEventIcon(event: string) {
		switch (event) {
			case 'entry:create':
				return 'mdi:plus-circle';
			case 'entry:update':
				return 'mdi:pencil';
			case 'entry:publish':
				return 'mdi:publish';
			case 'webhook:failure':
				return 'mdi:alert-circle';
			case 'ai:response':
				return 'mdi:robot';
			default:
				return 'mdi:information';
		}
	}
</script>

<div
	class="flex flex-col bg-surface-100-800-token border border-surface-500/30 dark:border-white/10 rounded-xl shadow-2xl dark:shadow-primary-500/10 overflow-hidden backdrop-blur-md transition-all h-full"
	style={screen.isMobile ? 'width: 100%;' : 'width: 350px;'}
>
	<!-- Header -->
	<div
		use:ondrag
		class="flex items-center justify-between p-4 bg-surface-200-700-token border-b border-surface-500/30 dark:border-white/10 shrink-0 cursor-grab active:cursor-grabbing"
	>
		<h3 class="font-bold text-lg flex items-center gap-2 pointer-events-none select-none">
			<iconify-icon icon="material-symbols:Forum-outline" width="24"></iconify-icon>
			{collaboration.currentRoom ? 'Room Collaboration' : 'Collaboration'}
		</h3>
		<div class="flex items-center gap-3">
			<SystemTooltip title={collaboration.isConnected ? 'Connected to real-time events' : 'Real-time collaboration is offline (Reconnecting...)'}>
				<div class="flex items-center gap-1 cursor-help">
					<span class="flex h-2 w-2 rounded-full {collaboration.isConnected ? 'bg-primary-500' : 'bg-error-500'} animate-pulse"></span>
					<span class="text-xs opacity-70">{collaboration.isConnected ? 'Live' : 'Offline'}</span>
				</div>
			</SystemTooltip>

			<button class="btn-icon preset-outlined rounded-full" onclick={() => collaboration.togglePanel()} aria-label="Close panel">
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex border-b border-surface-500/30 shrink-0">
		<button
			class="flex-1 py-2 text-sm font-medium transition-colors {collaboration.activeTab === 'activity'
				? 'bg-primary-500/10 border-b-2 border-primary-500'
				: 'opacity-60 hover:opacity-100'}"
			onclick={() => (collaboration.activeTab = 'activity')}
		>
			Activity
		</button>
		<button
			class="flex-1 py-2 text-sm font-medium transition-colors {collaboration.activeTab === 'chat'
				? 'bg-primary-500/10 border-b-2 border-primary-500'
				: 'opacity-60 hover:opacity-100'}"
			onclick={() => (collaboration.activeTab = 'chat')}
		>
			{chatLabel}
		</button>
	</div>

	<!-- Content Area -->
	<div class="flex-1 overflow-y-auto p-4 custom-scrollbar" bind:this={scrollContainer}>
		{#if collaboration.activeTab === 'activity'}
			<div class="space-y-4">
				{#if collaboration.activities.length === 0}
					<div class="text-center py-10 opacity-50">
						<iconify-icon icon="mdi:History" width="48"></iconify-icon>
						<p>No recent activity</p>
					</div>
				{/if}
				{#each collaboration.activities as activity (activity.timestamp)}
					<div transition:slide|local class="flex gap-3 p-3 rounded-lg bg-surface-300-600-token/30 border border-surface-500/10">
						<div class="mt-1"><iconify-icon icon={getEventIcon(activity.event)} width="20" class="text-primary-500"></iconify-icon></div>
						<div class="flex-1 min-w-0">
							<p class="text-sm">
								<span class="font-bold text-primary-500">{activity.user?.username || 'System'}</span>
								<span class="opacity-80">
									{#if activity.event === 'entry:create'}
										created a new record
									{:else if activity.event === 'entry:update'}
										updated a record
									{:else if activity.event === 'entry:publish'}
										published content
									{:else}
										{activity.event}
									{/if}
								</span>
								{#if activity.collection}
									<span class="italic text-xs block opacity-60">in {activity.collection}</span>
								{/if}
							</p>
							<span class="text-[10px] opacity-40">{formatTimestamp(activity.timestamp)}</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="space-y-4">
				{#if collaboration.aiHistory.length === 0}
					<div class="text-center py-10 opacity-50">
						<iconify-icon icon="mdi:robot-happy-outline" width="48"></iconify-icon>
						<p>{aiEmptyText}</p>
					</div>
				{/if}
				{#each collaboration.aiHistory as msg, index (msg.timestamp + index)}
					<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div class="flex flex-col gap-1 max-w-[85%]">
							{#if msg.role !== 'user' && msg.user?.username}
								<span class="text-[10px] opacity-50 px-2">{msg.user.username}</span>
							{/if}
							<div
								class="p-3 rounded-2xl text-sm wrap-break-word overflow-hidden {msg.role === 'user'
									? 'bg-primary-500 text-white rounded-br-none'
									: 'bg-surface-300-600-token rounded-bl-none'} shadow-sm"
							>
								{msg.content}
								<div class="text-[9px] mt-1 opacity-50 {msg.role === 'user' ? 'text-white' : ''}">{formatTimestamp(msg.timestamp)}</div>
							</div>
						</div>
					</div>
				{/each}
				{#if collaboration.isTyping}
					<div class="flex justify-start">
						<div class="bg-surface-300-600-token p-3 rounded-2xl rounded-bl-none shadow-sm">
							<div class="flex gap-1">
								<span class="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce"></span>
								<span class="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
								<span class="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Footer / Input (only for Chat) -->
	{#if collaboration.activeTab === 'chat'}
		<div transition:slide|local class="p-4 bg-surface-200-700-token border-t border-surface-500/30 shrink-0">
			<form class="flex gap-2" onsubmit={handleSendMessage}>
				<input
					type="text"
					placeholder="Type a message..."
					class="flex-1 bg-surface-500/10 border border-surface-500/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
					bind:value={newMessage}
				/>
				<button
					type="submit"
					class="bg-primary-500 hover:bg-primary-600 text-white rounded-lg p-1.5 transition-colors disabled:opacity-50"
					disabled={!newMessage.trim() || (collaboration.isTyping && !collaboration.currentRoom)}
					aria-label="Send message"
				>
					<iconify-icon icon="mdi:send" width="20"></iconify-icon>
				</button>
			</form>
		</div>
	{/if}
</div>

<style lang="postcss">
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(var(--color-surface-500), 0.2);
		border-radius: 10px;
	}
</style>
