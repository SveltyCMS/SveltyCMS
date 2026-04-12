/**
 * @file src/services/collaboration/collaboration-service.ts
 * @description Frontend service for real-time collaborative editing using Yjs.
 * Manages document synchronization, awareness, and field-level presence.
 */

import { browser } from "$app/environment";
import { page } from "$app/state";
import { collectionValue } from "@src/stores/collection-store.svelte";
import { logger } from "@utils/logger";
import * as Y from "yjs";
import { untrack } from "svelte";

export interface CollaborativeUser {
  clientId: number;
  name: string;
  color: string;
  avatar?: string;
  activeField?: string | null;
  isTyping?: boolean;
}

class CollaborationService {
  // Reactive public state
  activeUsers = $state<CollaborativeUser[]>([]);
  isConnected = $state(false);
  isCollaborative = $state(false);

  // Internal state
  private ydoc: Y.Doc | null = null;
  private provider: any = null; // Will be SseProvider or HocuspocusProvider
  private awareness: any = null;
  private currentEntryId: string | null = null;
  private currentCollectionId: string | null = null;

  private awarenessUnsubscribe: (() => void) | null = null;
  private yMapObserver: any = null;

  private SseProvider: any = null; // Lazy-loaded provider

  async init(collection: any, entry: any): Promise<void> {
    if (!browser) return;

    const enabled = collection?.collaboration?.enabled === true;
    if (!enabled) {
      this.destroy();
      this.isCollaborative = false;
      return;
    }

    const entryId = entry?._id || "new";
    const collectionId = collection._id;

    // Prevent re-initializing for the same document
    if (this.currentCollectionId === collectionId && this.currentEntryId === entryId) {
      return;
    }

    this.destroy(); // Clean previous session

    this.currentCollectionId = collectionId;
    this.currentEntryId = entryId;
    this.isCollaborative = true;

    logger.info(`[Collaboration] Initializing for ${collectionId}/${entryId}`);

    try {
      this.ydoc = new Y.Doc();

      // Lazy load provider only when needed
      if (!this.SseProvider) {
        const mod = await import("./sse-provider.svelte.ts");
        this.SseProvider = mod.SseProvider;
      }

      const docId = `entry:${collectionId}:${entryId}`;

      this.provider = new this.SseProvider({
        docId,
        yDoc: this.ydoc,
        tenantId: page.data.tenantId,
      });

      this.awareness = this.provider.awareness;

      this.setupYjsObservers();
      this.setupAwareness();

      this.isConnected = true;
    } catch (error) {
      logger.error("[Collaboration] Failed to initialize", { error });
      this.isCollaborative = false;
      this.destroy();
    }
  }

  private setupYjsObservers() {
    if (!this.ydoc) return;

    const yMap = this.ydoc.getMap("content");

    this.yMapObserver = (_events: any[]) => {
      // Use untrack to prevent reactivity loops
      untrack(() => {
        const yjsData = yMap.toJSON();
        if (Object.keys(yjsData).length === 0) return;

        const current = (collectionValue.value as Record<string, any>) || {};
        const merged = { ...current, ...yjsData };

        // Simple deep equality check (can be optimized with a better diff later)
        if (JSON.stringify(current) !== JSON.stringify(merged)) {
          collectionValue.value = merged;
        }
      });
    };

    yMap.observeDeep(this.yMapObserver);
  }

  private setupAwareness() {
    if (!this.awareness) return;

    const user = page.data.user;
    const colors = [
      "#f87171",
      "#fb923c",
      "#fbbf24",
      "#4ade80",
      "#2dd4bf",
      "#38bdf8",
      "#818cf8",
      "#c084fc",
    ];

    this.awareness.setLocalStateField("user", {
      name: user?.name || "Anonymous",
      color: colors[Math.floor(Math.random() * colors.length)],
      avatar: user?.avatar,
    });

    // Awareness change handler
    const handleAwarenessChange = () => {
      const states = Array.from(this.awareness.getStates().entries()) as [number, any][];

      this.activeUsers = states.map(([clientId, state]) => ({
        clientId,
        name: state.user?.name || "Anonymous",
        color: state.user?.color || "#999",
        avatar: state.user?.avatar,
        activeField: state.activeField || null,
        isTyping: !!state.isTyping,
      }));
    };

    this.awareness.on("change", handleAwarenessChange);
    this.awarenessUnsubscribe = () => this.awareness.off("change", handleAwarenessChange);
  }

  /** Push local field change to Yjs */
  updateField(fieldName: string, value: any): void {
    if (!this.ydoc || !this.isCollaborative) return;

    const yMap = this.ydoc.getMap("content");
    const current = yMap.get(fieldName);

    // Avoid unnecessary updates
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      yMap.set(fieldName, value);
    }
  }

  /** Update field focus for cursor/highlight awareness */
  setFieldFocus(fieldName: string | null): void {
    if (this.awareness) {
      this.awareness.setLocalStateField("activeField", fieldName);
    }
  }

  /** Clean shutdown */
  destroy(): void {
    logger.info("[Collaboration] Destroying collaboration session");

    if (this.yMapObserver && this.ydoc) {
      const yMap = this.ydoc.getMap("content");
      yMap.unobserveDeep(this.yMapObserver);
    }

    this.awarenessUnsubscribe?.();
    this.provider?.destroy?.();
    this.ydoc?.destroy();

    // Reset state
    this.ydoc = null;
    this.provider = null;
    this.awareness = null;
    this.awarenessUnsubscribe = null;
    this.yMapObserver = null;

    this.isConnected = false;
    this.isCollaborative = false;
    this.activeUsers = [];
    this.currentEntryId = null;
    this.currentCollectionId = null;
  }

  getYDoc(): Y.Doc | null {
    return this.ydoc;
  }
}

// Singleton
export const collaborationService = new CollaborationService();
