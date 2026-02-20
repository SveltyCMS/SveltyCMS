/**
 * @file src/stores/collaboration-store.svelte.ts
 * @description Frontend store for real-time collaboration and activity streaming.
 * Handles EventSource connection to the SSE endpoint and manages activity logs.
 */

import type { AutomationEventPayload } from '@src/services/automation/types';
import { collections } from '@src/stores/collection-store.svelte';
import { toaster } from '@src/stores/store.svelte';
import { isReady } from '@src/stores/system/state';
import { ui } from '@src/stores/ui-store.svelte';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

export interface Message {
	content: string;
	role: 'user' | 'assistant' | 'system';
	timestamp: string;
	user?: {
		_id: string;
		username: string;
		avatar?: string;
	};
}

export type CollaborationTab = 'activity' | 'chat';

class CollaborationStore {
	// --- Reactive State ---
	activities = $state<AutomationEventPayload[]>([]);
	isConnected = $state(false);
	aiHistory = $state<Message[]>([]);
	isTyping = $state(false);
	activeTab = $state<CollaborationTab>('activity');
	currentRoom = $state<string | null>(null);

	private eventSource: EventSource | null = null;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private readonly effectCleanup?: () => void;

	constructor() {
		if (browser) {
			// Single effect root for reactive logic
			this.effectCleanup = $effect.root(() => {
				// 1. Connection Management
				$effect(() => {
					const ready = get(isReady);
					if (ready && !this.isConnected) {
						this.connect();
					} else if (!ready && this.isConnected) {
						this.close();
					}
				});

				// 2. Room Management (Auto-join based on collection)
				$effect(() => {
					const activeCollection = collections.active;
					const activeValue = collections.activeValue;

					if (activeCollection) {
						let room = `collection:${activeCollection._id}`;
						// If editing a specific entry, join the entry room
						if (activeValue && (activeValue as any)._id) {
							room = `entry:${(activeValue as any)._id}`;
						}

						if (this.currentRoom !== room) {
							this.joinRoom(room);
						}
					} else if (this.currentRoom !== null) {
						this.joinRoom(null);
					}
				});
			});
		}
	}

	/**
	 * Toggles the collaboration panel visibility via UIStore
	 */
	togglePanel() {
		const newState = ui.state.chatPanel === 'hidden' ? 'full' : 'hidden';
		ui.toggle('chatPanel', newState);
	}

	/**
	 * Joins a specific collaboration room
	 */
	joinRoom(roomId: string | null) {
		this.currentRoom = roomId;
		console.debug(`RTC: Joined room ${roomId || 'global'}`);
		// When joining a new room, we might want to clear or fetch history
		// For now, we just update the room state
	}

	/**
	 * Establishes SSE connection to the server
	 */
	connect() {
		if (!browser || this.eventSource || !get(isReady)) {
			return;
		}

		console.debug('RTC: Establishing connection...');
		this.eventSource = new EventSource('/api/events');

		this.eventSource.onopen = () => {
			this.isConnected = true;
			this.isTyping = false;
			if (this.reconnectTimeout) {
				clearTimeout(this.reconnectTimeout);
				this.reconnectTimeout = null;
			}
			console.log('RTC: Connected to activity stream');
		};

		this.eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === 'connected') {
					return;
				}
				this.handleEvent(data as AutomationEventPayload);
			} catch (err) {
				console.error('RTC: Failed to parse event data', err);
			}
		};

		this.eventSource.onerror = () => {
			this.isConnected = false;
			this.close();

			// Exponential backoff or simple retry
			if (!this.reconnectTimeout) {
				console.warn('RTC: Connection lost. Retrying in 5s...');
				this.reconnectTimeout = setTimeout(() => {
					this.reconnectTimeout = null;
					this.connect();
				}, 5000);
			}
		};
	}

	/**
	 * Closes the active connection
	 */
	close() {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.isConnected = false;
	}

	/**
	 * Dispatches incoming events to UI/Toasts
	 */
	private handleEvent(payload: AutomationEventPayload) {
		// Room Filtering: If we are in a room, only show events for that room OR global events
		if (this.currentRoom && payload.data?.room && payload.data.room !== this.currentRoom) {
			return;
		}

		// 1. Add to activity log (keep last 50)
		this.activities = [payload, ...this.activities].slice(0, 50);

		// 2. High-priority Notifications (Toasts)
		this.triggerToast(payload);

		// 3. AI Stream Handling
		if (payload.event === 'ai:response') {
			this.handleAiChunk(payload);
		}

		// 4. Chat Messages Handling
		if (payload.event === 'chat:message') {
			this.handleChatMessage(payload);
		}
	}

	private triggerToast(payload: AutomationEventPayload) {
		const username = payload.user?.username || payload.user?.email || 'Someone';

		switch (payload.event) {
			case 'entry:publish':
				toaster.success({
					title: 'Content Published',
					description: `${username} published an entry in ${payload.collection}`
				});
				break;
			case 'entry:create':
				toaster.info({
					title: 'New Entry',
					description: `${username} created a new record in ${payload.collection}`
				});
				break;
			case 'webhook:failure':
				toaster.error({
					title: 'Automation Failed',
					description: `Webhook for ${payload.collection} returned an error.`
				});
				break;
		}
	}

	private handleAiChunk(payload: AutomationEventPayload) {
		const text = (payload.data?.text as string) || '';
		const isDone = payload.data?.done === true;

		if (this.aiHistory.length === 0 || this.aiHistory.at(-1)!.role !== 'assistant') {
			this.aiHistory.push({
				role: 'assistant',
				content: text,
				timestamp: new Date().toISOString()
			});
		} else {
			this.aiHistory.at(-1)!.content += text;
		}

		this.isTyping = !isDone;
	}

	private handleChatMessage(payload: AutomationEventPayload) {
		const msg: Message = {
			role: payload.user?._id === 'ai' ? 'assistant' : 'user',
			content: (payload.data?.text as string) || '',
			timestamp: payload.timestamp || new Date().toISOString(),
			user: payload.user as any
		};
		this.aiHistory.push(msg);

		// If panel is closed, show a toast or notification
		if (ui.state.chatPanel === 'hidden') {
			toaster.info({
				title: `Message from ${msg.user?.username || 'User'}`,
				description: msg.content.length > 50 ? `${msg.content.substring(0, 50)}...` : msg.content
			});
		}
	}

	/**
	 * Send a message to the AI or Room
	 */
	async sendMessage(content: string) {
		if (!content.trim()) {
			return;
		}

		// Local optimistic update for AI chat
		if (this.activeTab === 'chat' && !this.currentRoom) {
			this.aiHistory.push({
				role: 'user',
				content,
				timestamp: new Date().toISOString()
			});
			this.isTyping = true;
		}

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content,
					room: this.currentRoom,
					tab: this.activeTab
				})
			});

			if (!res.ok) {
				throw new Error('Failed to send message');
			}
		} catch (err) {
			console.error('RTC: Send message error', err);
			toaster.error({ title: 'Error', description: 'Failed to send message' });
		}
	}

	clearActivities() {
		this.activities = [];
	}

	destroy() {
		this.close();
		this.effectCleanup?.();
	}
}

export const collaboration = new CollaborationStore();
