/**
 * @file src/stores/collaboration-store.svelte.ts
 * @description Frontend store for real-time collaboration and activity streaming.
 * Uses svelte-realtime for high-performance WebSocket communication.
 */

import type { AutomationEventPayload } from "@src/services/background/automation/types";
import { collections } from "@src/stores/collection-store.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { ui } from "@src/stores/ui-store.svelte";
import { browser } from "$app/environment";
import { events } from "$live/system";
import { chat, sendMessage as sendRpcMessage } from "$live/chat";

export interface Message {
  id?: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: string;
  user?: {
    _id: string;
    username: string;
    avatar?: string;
  };
}

export type CollaborationTab = "activity" | "chat";

class CollaborationStore {
  // --- UI State ---
  isTyping = $state(false);
  activeTab = $state<CollaborationTab>("activity");
  currentRoom = $state<string | null>(null);

  // --- Reactive Streams (Automatically synced stores) ---
  private eventStream = events;
  eventStreamValue = $state<any[]>([]);
  chatStreamValue = $state<any[]>([]);

  // Connection status is global/handled differently, we'll assume true for now.
  isConnected = $state(true);

  // --- Aggregated State ---
  activities = $derived(
    this.eventStreamValue.map((ev: any) => ({
      event: ev.event,
      collection: ev.data?.collection,
      user: ev.data?.user,
      timestamp: ev.timestamp,
      data: ev.data,
    })) as AutomationEventPayload[],
  );

  aiHistory = $derived(
    this.chatStreamValue.map((msg: any) => ({
      id: msg.id,
      content: msg.content,
      role: msg.role,
      timestamp: msg.timestamp,
      user: msg.user,
    })) as Message[],
  );

  private effectCleanup?: () => void;

  constructor() {
    if (browser) {
      // 1. Subscribe to the global events store
      const unsubscribeEvents = this.eventStream.subscribe((value: any) => {
        this.eventStreamValue = (value as any[]) || [];
      });

      this.effectCleanup = $effect.root(() => {
        // 2. Room Management (Auto-join based on collection)
        $effect(() => {
          const activeCollection = collections.active;
          const activeValue = collections.activeValue;

          if (activeCollection) {
            let room = `collection:${activeCollection._id}`;
            if (activeValue && (activeValue as any)._id) {
              room = `entry:${(activeValue as any)._id}`;
            }

            if (this.currentRoom !== room) {
              this.currentRoom = room;
            }
          } else if (this.currentRoom !== null) {
            this.currentRoom = null;
          }
        });

        // 3. Dynamic chat stream subscription based on currentRoom
        $effect(() => {
          const stream = chat(this.currentRoom || "ai");
          const unsubscribeChat = stream.subscribe((value: any) => {
            this.chatStreamValue = (value as any[]) || [];
          });
          return unsubscribeChat;
        });

        // 4. Notification Triggers (Toasts)
        $effect(() => {
          const latestEvent = this.eventStreamValue.at(-1);
          if (latestEvent) {
            this.triggerToast(latestEvent);
          }
        });

        // 5. Typing State Management
        $effect(() => {
          const history = this.aiHistory;
          const lastMsg = history.at(-1);
          this.isTyping = lastMsg?.role === "user";
        });
      });

      // Wrap the cleanup to release the events subscription as well
      const originalCleanup = this.effectCleanup;
      this.effectCleanup = () => {
        unsubscribeEvents();
        originalCleanup();
      };
    }
  }

  togglePanel() {
    const newState = ui.state.chatPanel === "hidden" ? "full" : "hidden";
    ui.toggle("chatPanel", newState);
  }

  private triggerToast(payload: any) {
    // Only toast if the event is fresh (within last 2 seconds)
    if (Date.now() - payload.timestamp > 2000) return;

    const username = payload.data?.user?.username || payload.data?.user?.email || "Someone";

    switch (payload.event) {
      case "entry:publish":
        toast.success({
          title: "Content Published",
          description: `${username} published an entry in ${payload.data.collection}`,
        });
        break;
      case "entry:create":
        toast.info({
          title: "New Entry",
          description: `${username} created a new record in ${payload.data.collection}`,
        });
        break;
    }
  }

  /**
   * Send a message to the AI or Room via WebSocket RPC
   */
  async sendMessage(content: string) {
    if (!content.trim()) return;

    try {
      // Extract history for AI context
      const history = this.aiHistory.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await sendRpcMessage({
        content,
        room: this.currentRoom || "ai",
        history,
      });
    } catch (err) {
      console.error("RTC: Send message error", err);
      toast.error({ title: "Error", description: "Failed to send message" });
    }
  }

  clearActivities() {
    // In svelte-realtime, streams are server-managed.
    // Clearing locally doesn't make sense for synced streams.
  }

  destroy() {
    this.effectCleanup?.();
  }
}

export const collaboration = new CollaborationStore();
